// js/blog.js

// Lấy danh sách bài viết từ API
async function getPosts() {
    try {
        const response = await fetch('/api/posts');
        
        if (!response.ok) {
            throw new Error(`Lỗi khi lấy dữ liệu: ${response.status}`);
        }
        
        const posts = await response.json();
        
        // Trả về chỉ các bài viết đã xuất bản
        return posts.filter(post => post.status === 'published');
    } catch (error) {
        console.error('Error fetching posts:', error);
        
        // Fallback sử dụng localStorage nếu API bị lỗi
        const posts = JSON.parse(localStorage.getItem('blog-posts') || '[]');
        return posts.filter(post => post.status === 'published');
    }
}

// Lấy bài viết theo ID
async function getPostById(id) {
    try {
        const response = await fetch(`/api/post/${id}`);
        
        if (!response.ok) {
            throw new Error(`Lỗi khi lấy dữ liệu: ${response.status}`);
        }
        
        return response.json();
    } catch (error) {
        console.error('Error fetching post:', error);
        
        // Fallback sử dụng localStorage nếu API bị lỗi
        const posts = JSON.parse(localStorage.getItem('blog-posts') || '[]');
        return posts.find(post => post.id === id) || null;
    }
}

// Chuyển đổi nội dung Markdown thành HTML
function markdownToHtml(markdown) {
    if (!markdown) return '';
    
    // Xử lý hình ảnh: ![alt](url)
    let html = markdown.replace(/!\[(.*?)\]\((.*?)\)/g, function(match, alt, url) {
        return `<img src="${url}" alt="${alt || 'Hình ảnh'}" title="${alt || ''}" />`;
    });
    
    // Xử lý các đoạn văn
    html = html.split('\n\n').map(paragraph => {
        if (paragraph.trim() === '') return '';
        if (paragraph.trim().startsWith('<img')) return paragraph;
        return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    
    return html;
}
