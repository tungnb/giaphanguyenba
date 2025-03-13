OrgChart.templates.familyTemplate = Object.assign({}, OrgChart.templates.ana);
OrgChart.templates.familyTemplate.size = [200, 140];
OrgChart.templates.familyTemplate.node = 
    '<rect x="0" y="0" width="200" height="140" rx="10" ry="10" class="node-card"' +
    ' stroke-width="1" fill="#ffffff" stroke="#e4e4e4"></rect>' +
    '<line x1="0" y1="0" x2="20" y2="0" stroke-width="0"></line>';

OrgChart.templates.familyTemplate.img_0 = 
    '<clipPath id="{randId}"><circle cx="100" cy="45" r="40"></circle></clipPath>' +
    '<image preserveAspectRatio="xMidYMid slice" clip-path="url(#{randId})" ' +
    'xlink:href="{val}" x="60" y="5" width="80" height="80"></image>';

OrgChart.templates.familyTemplate.field_0 = 
    '<text width="180" style="font-weight: bold; font-size: 14px;" ' +
    'fill="#333" x="100" y="105" text-anchor="middle">{val}</text>';

OrgChart.templates.familyTemplate.field_1 = 
    '<text width="180" style="font-size: 12px;" fill="#555" x="100" y="125" text-anchor="middle">{val}</text>';

OrgChart.templates.familyTemplate.link = 
    '<path stroke="#0066cc" stroke-width="2" fill="none" d="M{xa},{ya} {xb},{yb} {xc},{yc} L{xd},{yd}"></path>';

// Phiên bản cho nam giới
OrgChart.templates.male = Object.assign({}, OrgChart.templates.familyTemplate);
OrgChart.templates.male.node = 
    '<rect x="0" y="0" width="200" height="140" rx="10" ry="10" class="node-card male"' +
    ' stroke-width="1" fill="#ffffff" stroke="#e4e4e4"></rect>' +
    '<rect x="0" y="0" width="10" height="140" fill="#0066cc" rx="3" ry="3"></rect>';

// Phiên bản cho nữ giới
OrgChart.templates.female = Object.assign({}, OrgChart.templates.familyTemplate);
OrgChart.templates.female.node = 
    '<rect x="0" y="0" width="200" height="140" rx="10" ry="10" class="node-card female"' +
    ' stroke-width="1" fill="#ffffff" stroke="#e4e4e4"></rect>' +
    '<rect x="0" y="0" width="10" height="140" fill="#e91e63" rx="3" ry="3"></rect>'; 