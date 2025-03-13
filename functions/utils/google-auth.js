// functions/utils/google-auth.js
// Các hàm tiện ích để xác thực và kết nối với Google API

// Hàm lấy token xác thực Google API
export async function getGoogleAccessToken(serviceAccountKey) {
  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const jwtClaimSet = {
    iss: serviceAccountKey.client_email,
    // Thêm quyền Google Drive đầy đủ để có thể upload và quản lý files
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
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

// Hàm kiểm tra và đảm bảo sheet tồn tại
export async function ensureSheetExists(token, spreadsheetId, sheetName) {
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
    
    // Nếu sheet chưa tồn tại, tạo mới
    if (!sheetExists) {
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
      
      // Thêm tiêu đề cho sheet mới
      const headerResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:K1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [
              [
                "id", 
                "title", 
                "content", 
                "featuredImage", 
                "category", 
                "tags", 
                "status", 
                "date", 
                "author", 
                "excerpt", 
                "viewCount"
              ]
            ]
          })
        }
      );
      
      if (!headerResponse.ok) {
        const errorData = await headerResponse.json();
        console.error('Error adding headers:', errorData);
        throw new Error(`Failed to add headers: ${headerResponse.status}`);
      }
    }
    
    return sheetExists;
  } catch (error) {
    console.error('Error in ensureSheetExists:', error);
    throw error;
  }
}

// Hàm chuyển đổi PEM thành binary
function pemToBinary(pem) {
  // Loại bỏ header, footer và dòng mới
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  // Giải mã Base64 thành binary
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  return bytes.buffer;
} 