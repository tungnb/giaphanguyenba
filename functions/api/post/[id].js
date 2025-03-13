// functions/api/post/[id].js
export async function onRequest(context) {
  try {
    // Xử lý trường hợp OPTIONS request (CORS preflight)
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }
    
    // Chỉ hỗ trợ phương thức GET
    if (context.request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Lấy ID bài viết từ URL
    const id = context.params.id;
    
    // Lấy thông tin từ biến môi trường
    const serviceAccountKey = JSON.parse(context.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = context.env.GOOGLE_SHEET_ID;
    
    try {
      // Lấy token xác thực Google API
      const token = await getGoogleAccessToken(serviceAccountKey);
      
      // Kiểm tra và đảm bảo Sheet1 tồn tại
      await ensureSheetExists(token, spreadsheetId, "Sheet1");
      
      // Lấy tất cả bài viết
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:K`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Google Sheets API error details:', errorData);
        throw new Error(`Google Sheets API error (${response.status}): ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      
      // Kiểm tra xem có dữ liệu và tiêu đề không
      if (!data.values || data.values.length <= 1) {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Lấy dữ liệu từ hàng 2 trở đi (bỏ qua tiêu đề)
      const rows = data.values.slice(1).filter(row => row.length > 0);
      
      // Chuyển đổi dữ liệu thành đối tượng Post
      const posts = rows.map(row => {
        // Kết hợp nội dung từ các phần
        let fullContent = row[2] || '';
        
        // Kiểm tra xem có bao nhiêu phần
        const contentPartsCount = parseInt(row[5] || '1', 10);
        
        if (contentPartsCount > 1 && row[3]) {
          fullContent += row[3];
        }
        
        if (contentPartsCount > 2 && row[4]) {
          fullContent += row[4];
        }
        
        return {
          id: row[0] || '',
          title: row[1] || '',
          content: fullContent,
          featuredImage: row[6] || '',
          category: row[7] || '',
          tags: row[8] || '',
          status: row[9] || 'draft',
          date: row[10] || new Date().toISOString().split('T')[0]
        };
      });
      
      // Tìm bài viết theo ID
      const post = posts.find(post => post.id === id);
      
      if (!post) {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Trả về bài viết dạng JSON
      return new Response(JSON.stringify(post), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (apiError) {
      console.error('Google API error:', apiError);
      throw apiError;
    }
  } catch (error) {
    console.error('API error:', error);
    
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Hàm kiểm tra và đảm bảo sheet tồn tại
async function ensureSheetExists(token, spreadsheetId, sheetName) {
  try {
    // Lấy thông tin về spreadsheet
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error checking sheet existence:', errorData);
      throw new Error(`Failed to check sheet existence: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Kiểm tra xem sheet đã tồn tại chưa
    const sheetExists = data.sheets.some(sheet => 
      sheet.properties && sheet.properties.title === sheetName
    );
    
    if (!sheetExists) {
      // Tạo sheet mới
      const createResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName
                  }
                }
              }
            ]
          })
        }
      );
      
      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        console.error('Error creating sheet:', errorData);
        throw new Error(`Failed to create sheet: ${createResponse.status}`);
      }
      
      // Thêm tiêu đề
      if (sheetName === "Sheet1") {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:K1?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              values: [['ID', 'Title', 'Content', 'ContentPart2', 'ContentPart3', 'ContentPartsCount', 'FeaturedImage', 'Category', 'Tags', 'Status', 'Date']]
            })
          }
        );
      }
    }
  } catch (error) {
    console.error('Error ensuring sheet exists:', error);
    throw error;
  }
}

// Hàm lấy token xác thực Google API
async function getGoogleAccessToken(serviceAccountKey) {
  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const jwtClaimSet = {
    iss: serviceAccountKey.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  // Tạo JWT token
  const encodedHeader = btoa(JSON.stringify(jwtHeader))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
    
  const encodedClaimSet = btoa(JSON.stringify(jwtClaimSet))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;
  
  // Tạo private key từ string
  const privateKey = serviceAccountKey.private_key.replace(/\\n/g, '\n');
  
  // Tạo chữ ký
  const encoder = new TextEncoder();
  const signatureInputBuffer = encoder.encode(signatureInput);
  
  // Tạo crypto key từ private key PEM
  const privateKeyBinary = pemToBinary(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBinary,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' }
    },
    false,
    ['sign']
  );
  
  // Ký JWT
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    signatureInputBuffer
  );
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const jwt = `${signatureInput}.${encodedSignature}`;
  
  // Lấy access token từ JWT
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json();
    console.error('Error getting access token:', errorData);
    throw new Error(`Failed to get access token (${tokenResponse.status}): ${JSON.stringify(errorData)}`);
  }
  
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Chuyển đổi PEM sang binary
function pemToBinary(pem) {
  // Loại bỏ header/footer và newlines, sau đó decode base64
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}
