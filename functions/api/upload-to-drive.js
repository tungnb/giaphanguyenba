import { getGoogleAccessToken } from '../utils/google-auth.js';

export async function onRequest(context) {
  try {
    // Xử lý trường hợp OPTIONS request (CORS preflight)
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }
    
    // THÊM MỚI: Nếu là GET request, xử lý truy cập proxy cho ảnh
    if (context.request.method === 'GET') {
      const url = new URL(context.request.url);
      const fileId = url.searchParams.get('id');
      const size = url.searchParams.get('size') || 'w800';
      
      if (!fileId) {
        return new Response(JSON.stringify({ success: false, message: 'Thiếu ID file' }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
          }
        });
      }
      
      try {
        // Tạo URL truy cập hình ảnh Google Drive
        const imageUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;
        
        // Lấy ảnh từ Google Drive và truyền qua proxy
        const imageResponse = await fetch(imageUrl);
        
        if (!imageResponse.ok) {
          throw new Error(`Không thể lấy ảnh: ${imageResponse.status}`);
        }
        
        // Đọc dữ liệu hình ảnh
        const imageData = await imageResponse.arrayBuffer();
        
        // Thêm CORS headers và trả về ảnh
        return new Response(imageData, {
          status: 200,
          headers: {
            'Content-Type': imageResponse.headers.get('Content-Type') || 'image/jpeg',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      } catch (proxyError) {
        console.error('Lỗi proxy ảnh:', proxyError);
        return new Response(JSON.stringify({ success: false, message: `Lỗi proxy: ${proxyError.message}` }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
          }
        });
      }
    }
    
    // Chỉ chấp nhận phương thức POST cho upload
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Method not allowed' 
      }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Lấy thông tin từ biến môi trường - Đã đổi tên biến
    const serviceAccountKey = JSON.parse(context.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);
    const folderId = context.env.GOOGLE_DRIVE_FOLDER_ID; // ID thư mục lưu ảnh

    if (!folderId) {
      throw new Error('Chưa cấu hình ID thư mục Google Drive');
    }
    
    // Lấy dữ liệu từ FormData
    const formData = await context.request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Không tìm thấy file' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Kiểm tra kích thước tệp (giới hạn 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Kích thước file vượt quá giới hạn 10MB' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Kiểm tra loại tệp tin
    if (!file.type.startsWith('image/')) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'File không phải là hình ảnh' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Lấy token xác thực Google API
    const token = await getGoogleAccessToken(serviceAccountKey);

    // Đọc nội dung file
    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(fileArrayBuffer);

    // Tạo tên file duy nhất
    const originalFilename = formData.get('filename') || file.name || `image_${Date.now()}.jpg`;
    const uniqueFilename = `${Date.now()}_${originalFilename}`;

    // Multipart request để upload file lên Google Drive
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    // Tạo metadata cho file
    const metadata = {
      name: uniqueFilename,
      mimeType: file.type,
      parents: [folderId]
    };

    // Tạo body cho request
    let requestBody = delimiter;
    requestBody += 'Content-Type: application/json\r\n\r\n';
    requestBody += JSON.stringify(metadata) + delimiter;
    requestBody += `Content-Type: ${file.type}\r\n\r\n`;

    // Kết hợp phần đầu, nội dung file và phần kết thúc
    const requestBodyStart = new TextEncoder().encode(requestBody);
    const requestBodyEnd = new TextEncoder().encode(closeDelimiter);

    // Tính tổng chiều dài
    const contentLength = requestBodyStart.length + fileBuffer.length + requestBodyEnd.length;

    // Gửi request upload lên Google Drive
    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': contentLength.toString()
      },
      body: new Blob([requestBodyStart, fileBuffer, requestBodyEnd])
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Google Drive API error (raw response):', errorText);
      
      try {
        const errorData = JSON.parse(errorText);
        console.error('Google Drive API error (parsed):', errorData);
        const errorDetails = errorData.error || {};
        throw new Error(`Lỗi khi upload lên Google Drive: ${uploadResponse.status}, mã: ${errorDetails.code}, lý do: ${errorDetails.message || 'Không rõ'}`);
      } catch (parseError) {
        throw new Error(`Lỗi khi upload lên Google Drive: ${uploadResponse.status}, response: ${errorText.substring(0, 200)}`);
      }
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload thành công, kết quả:', uploadResult);
    const fileId = uploadResult.id;

    // Thiết lập quyền truy cập (public)
    try {
      const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      });

      if (!permissionResponse.ok) {
        const permErrorText = await permissionResponse.text();
        console.error('Permission error (raw):', permErrorText);
        try {
          const permErrorData = JSON.parse(permErrorText);
          console.error('Permission error (parsed):', permErrorData);
          throw new Error(`Lỗi khi cấp quyền truy cập file: ${permissionResponse.status}, chi tiết: ${JSON.stringify(permErrorData.error || permErrorData)}`);
        } catch (parseError) {
          throw new Error(`Lỗi khi cấp quyền truy cập file: ${permissionResponse.status}`);
        }
      }
    } catch (permError) {
      console.error('Lỗi khi cấp quyền nhưng file đã upload thành công:', permError);
      // Vẫn tiếp tục vì file đã được upload, chỉ là không public
    }

    // URL gốc cho truy cập trực tiếp
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    
    // URL thumbnail thông qua proxy để tránh vấn đề CORS
    const proxyUrl = `/api/upload-to-drive?id=${fileId}`;
    
    // URL dự phòng sử dụng iframe thay vì img
    const iframeUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    
    // URL truy cập thông qua thumbnail
    const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    
    // URL truy cập thông qua file view
    const fileViewUrl = `https://drive.google.com/file/d/${fileId}/view`;

    // HTML snippet để nhúng ảnh an toàn với cơ chế dự phòng
    const safeImageHtml = `<img src="${proxyUrl}" onerror="if(!this.fallback){this.fallback=true;this.src='${directUrl}';this.onerror=function(){if(!this.iframeReplace){this.iframeReplace=true;this.outerHTML='<iframe src=\\'${iframeUrl}\\' style=\\'width:100%;height:auto;border:none;\\' loading=\\'lazy\\'></iframe>'}}};" loading="lazy" style="max-width:100%;">`;

    // Trả về đầy đủ thông tin
    return new Response(JSON.stringify({
      success: true,
      imageUrl: proxyUrl, // Sử dụng proxy URL làm URL chính
      directUrl: directUrl, // URL trực tiếp từ Drive
      thumbnailUrl: thumbnailUrl,
      proxyUrl: proxyUrl, // URL qua proxy
      iframeUrl: iframeUrl,
      fileViewUrl: fileViewUrl,
      fileId: fileId,
      safeImageHtml: safeImageHtml,
      note: 'Sử dụng proxyUrl để tránh lỗi CORS. Thử directUrl nếu proxyUrl không hoạt động. Giải pháp cuối cùng là dùng safeImageHtml.'
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Upload API error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Lỗi máy chủ: ${error.message}` 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
} 