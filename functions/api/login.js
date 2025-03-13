// functions/api/login.js
export async function onRequest(context) {
  try {
    // Xử lý trường hợp OPTIONS request (CORS preflight)
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }
    
    // Chỉ chấp nhận phương thức POST
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Lấy thông tin đăng nhập từ request body
    const { username, password } = await context.request.json();
    
    // Kiểm tra nếu thiếu thông tin
    if (!username || !password) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Vui lòng nhập tên đăng nhập và mật khẩu' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Lấy thông tin từ biến môi trường
    const serviceAccountKey = JSON.parse(context.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = context.env.GOOGLE_SHEET_ID;
    
    // Tạo JWT token để xác thực với Google API
    const token = await getGoogleAccessToken(serviceAccountKey);
    
    // Lấy dữ liệu từ sheet Users
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Users!A2:B`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.status}`);
    }
    
    const data = await response.json();
    const rows = data.values || [];
    
    // Tìm kiếm user có username và password khớp
    const user = rows.find(row => row[0] === username && row[1] === password);
    
    if (user) {
      // Xác thực thành công
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Đăng nhập thành công',
        username: user[0]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Xác thực thất bại
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Tên đăng nhập hoặc mật khẩu không đúng' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Login API error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Lỗi máy chủ: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
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
