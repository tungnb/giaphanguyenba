// functions/api/family.js
export async function onRequest(context) {
    try {
      // Xử lý CORS
      if (context.request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }
      
      // Lấy thông tin từ biến môi trường
      const serviceAccountKey = JSON.parse(context.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      const spreadsheetId = context.env.GOOGLE_SHEET_ID;
      
      // Lấy token xác thực
      const token = await getGoogleAccessToken(serviceAccountKey);
      
      // Đảm bảo sheet FamilyMembers tồn tại
      await ensureSheetExists(token, spreadsheetId, "FamilyMembers");
      
      if (context.request.method === 'GET') {
        // Lấy danh sách thành viên
        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/FamilyMembers!A1:K`,
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
        
        // Kiểm tra dữ liệu
        if (!data.values || data.values.length <= 1) {
          return new Response(JSON.stringify([]), {
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Định nghĩa tiêu đề chuẩn
        const expectedHeaders = ['ID', 'Name', 'Gender', 'Generation', 'BirthDate', 'DeathDate', 'Photo', 'Bio', 'Parents', 'Spouses', 'Children'];
        
        // Chuyển đổi dữ liệu thành đối tượng
        const headerRow = data.values[0];
        const members = data.values.slice(1).map(row => {
          const member = {};
          headerRow.forEach((header, index) => {
            if (header === 'Parents' || header === 'Children' || header === 'Spouses') {
              member[header.toLowerCase()] = row[index] ? row[index].split(',') : [];
            } else {
              member[header.toLowerCase()] = row[index] || '';
            }
          });
          return member;
        });
        
        return new Response(JSON.stringify(members), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } 
      else if (context.request.method === 'POST') {
        // Thêm hoặc cập nhật thành viên
        const member = await context.request.json();
        
        // Đảm bảo có ID
        if (!member.id) {
          member.id = Date.now().toString();
        }
        
        // Chuyển đổi mảng thành chuỗi cho các quan hệ
        const parents = Array.isArray(member.parents) ? member.parents.join(',') : member.parents || '';
        const spouses = Array.isArray(member.spouses) ? member.spouses.join(',') : member.spouses || '';
        const children = Array.isArray(member.children) ? member.children.join(',') : member.children || '';
        
        // Kiểm tra xem thành viên đã tồn tại chưa
        const checkResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/FamilyMembers!A:A`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        const checkData = await checkResponse.json();
        const ids = checkData.values || [];
        let rowIndex = -1;
        
        for (let i = 1; i < ids.length; i++) {
          if (ids[i] && ids[i][0] === member.id) {
            rowIndex = i + 1;
            break;
          }
        }
        
        if (rowIndex > 1) {
          // Cập nhật thành viên hiện có
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/FamilyMembers!A${rowIndex}:K${rowIndex}?valueInputOption=RAW`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                values: [[
                  member.id,
                  member.name,
                  member.gender,
                  member.generation,
                  member.birthdate,
                  member.deathdate,
                  member.photo,
                  member.bio,
                  parents,
                  spouses,
                  children
                ]]
              })
            }
          );
        } else {
          // Thêm thành viên mới
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/FamilyMembers!A:K:append?valueInputOption=RAW`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                values: [[
                  member.id,
                  member.name,
                  member.gender,
                  member.generation,
                  member.birthdate,
                  member.deathdate,
                  member.photo,
                  member.bio,
                  parents,
                  spouses,
                  children
                ]]
              })
            }
          );
        }
        
        return new Response(JSON.stringify(member), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      else if (context.request.method === 'DELETE') {
        // Xóa thành viên
        const { id } = await context.request.json();
        
        if (!id) {
          return new Response(JSON.stringify({ error: 'Missing member ID' }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Lấy thông tin về spreadsheet để xác định sheetId
        const sheetInfoResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        const sheetData = await sheetInfoResponse.json();
        
        // Tìm sheetId của sheet FamilyMembers
        let familyMembersSheetId = null;
        for (const sheet of sheetData.sheets) {
          if (sheet.properties && sheet.properties.title === 'FamilyMembers') {
            familyMembersSheetId = sheet.properties.sheetId;
            break;
          }
        }
        
        if (familyMembersSheetId === null) {
          return new Response(JSON.stringify({ error: 'FamilyMembers sheet not found' }), {
            status: 404,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Tìm hàng của thành viên cần xóa
        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/FamilyMembers!A:A`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        const data = await response.json();
        const ids = data.values || [];
        let rowIndex = -1;
        
        for (let i = 1; i < ids.length; i++) {
          if (ids[i] && ids[i][0] === id) {
            rowIndex = i + 1;
            break;
          }
        }
        
        if (rowIndex <= 1) {
          return new Response(JSON.stringify({ error: 'Member not found' }), {
            status: 404,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Xóa hàng sử dụng sheetId chính xác của FamilyMembers
        await fetch(
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
                  deleteDimension: {
                    range: {
                      sheetId: familyMembersSheetId,
                      dimension: 'ROWS',
                      startIndex: rowIndex - 1,
                      endIndex: rowIndex
                    }
                  }
                }
              ]
            })
          }
        );
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      console.error('Family API error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
  
  // Đảm bảo sheet tồn tại
  async function ensureSheetExists(token, spreadsheetId, sheetName) {
    // Lấy thông tin về spreadsheet
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const data = await response.json();
    
    // Kiểm tra xem sheet đã tồn tại chưa
    const sheetExists = data.sheets.some(sheet => 
      sheet.properties && sheet.properties.title === sheetName
    );
    
    if (!sheetExists) {
      // Tạo sheet mới
      await fetch(
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
      
      // Thêm tiêu đề
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:K1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [['ID', 'Name', 'Gender', 'Generation', 'BirthDate', 'DeathDate', 'Photo', 'Bio', 'Parents', 'Spouses', 'Children']]
          })
        }
      );
    }
  }
  
  // Hàm lấy token xác thực Google API (copy từ login.js)
  async function getGoogleAccessToken(serviceAccountKey) {
    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT'
    };
    
    const now = Math.floor(Date.now() / 1000);
    const jwtClaimSet = {
      iss: serviceAccountKey.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
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
  
  // Chuyển đổi PEM sang binary (copy từ login.js)
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