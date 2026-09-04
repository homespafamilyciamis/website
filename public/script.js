// Set minimum date to today
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tanggal').setAttribute('min', today);
});

// Update total price when service is selected
function updatePrice() {
    const serviceSelect = document.getElementById('service');
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    
    if (selectedOption.value) {
        const [serviceName, price] = selectedOption.value.split('|');
        const priceInRupiah = parseInt(price) * 1000;
        document.getElementById('total-price').textContent = 'Rp ' + priceInRupiah.toLocaleString('id-ID');
    } else {
        document.getElementById('total-price').textContent = 'Rp 0';
    }
}

// Format currency
function formatCurrency(value) {
    return 'Rp ' + value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Submit booking form
async function submitBooking(event) {
    event.preventDefault();
    
    const serviceSelect = document.getElementById('service');
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    
    if (!selectedOption.value) {
        alert('Mohon pilih layanan terlebih dahulu!');
        return;
    }
    
    const [serviceName, price] = selectedOption.value.split('|');
    
    const bookingData = {
        service: serviceName,
        price: parseInt(price) * 1000,
        tanggal: document.getElementById('tanggal').value,
        jam: document.getElementById('jam').value,
        durasi: document.getElementById('durasi').value,
        nama: document.getElementById('nama').value,
        whatsapp: document.getElementById('whatsapp').value,
        alamat: document.getElementById('alamat').value
    };
    
    // Validasi
    if (!bookingData.tanggal || !bookingData.jam || !bookingData.nama || !bookingData.whatsapp || !bookingData.alamat) {
        alert('Mohon lengkapi semua field yang wajib diisi!');
        return;
    }
    
    try {
        // Send to backend
        const response = await fetch('/api/booking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bookingData)
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Show success message
            alert('✅ Booking berhasil! Silakan lanjutkan ke WhatsApp untuk konfirmasi.');
            
            // Prepare WhatsApp message
            const message = encodeURIComponent(
                `Halo Home Spa Family, saya ingin melakukan booking:\n\n` +
                `📋 Layanan: ${bookingData.service}\n` +
                `📅 Tanggal: ${formatDate(bookingData.tanggal)}\n` +
                `🕐 Jam: ${bookingData.jam}\n` +
                `⏱️ Durasi: ${bookingData.durasi}\n` +
                `👤 Nama: ${bookingData.nama}\n` +
                `📱 WhatsApp: ${bookingData.whatsapp}\n` +
                `🏠 Alamat: ${bookingData.alamat}\n` +
                `💰 Total: ${formatCurrency(bookingData.price)}\n\n` +
                `Terima kasih!`
            );
            
            // Open WhatsApp
            window.open(`https://wa.me/6283195585892?text=${message}`, '_blank');
            
            // Reset form
            document.getElementById('booking-form').reset();
            document.getElementById('total-price').textContent = 'Rp 0';
        } else {
            alert('❌ Ada kesalahan saat melakukan booking. Silakan coba lagi.');
        }
    } catch (error) {
        console.error('Error:', error);
        // Even if backend error, still proceed with WhatsApp
        const message = encodeURIComponent(
            `Halo Home Spa Family, saya ingin melakukan booking:\n\n` +
            `📋 Layanan: ${bookingData.service}\n` +
            `📅 Tanggal: ${formatDate(bookingData.tanggal)}\n` +
            `🕐 Jam: ${bookingData.jam}\n` +
            `⏱️ Durasi: ${bookingData.durasi}\n` +
            `👤 Nama: ${bookingData.nama}\n` +
            `📱 WhatsApp: ${bookingData.whatsapp}\n` +
            `🏠 Alamat: ${bookingData.alamat}\n` +
            `💰 Total: ${formatCurrency(bookingData.price)}`
        );
        
        window.open(`https://wa.me/6283195585892?text=${message}`, '_blank');
        document.getElementById('booking-form').reset();
        document.getElementById('total-price').textContent = 'Rp 0';
    }
}

// Format date to Indonesian format
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString + 'T00:00:00').toLocaleDateString('id-ID', options);
}

// Mobile menu toggle
document.querySelector('.hamburger').addEventListener('click', function() {
    const navMenu = document.querySelector('.nav-menu');
    navMenu.style.display = navMenu.style.display === 'flex' ? 'none' : 'flex';
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({behavior: 'smooth'});
        }
    });
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', function() {
        const navMenu = document.querySelector('.nav-menu');
        navMenu.style.display = 'none';
    });
});

// Make sidebar sticky on scroll
let lastScrollTop = 0;
const sidebar = document.querySelector('.booking-sidebar');

window.addEventListener('scroll', function() {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (sidebar) {
        if (scrollTop > lastScrollTop) {
            // Scroll down
            sidebar.style.boxShadow = '-2px 0 12px rgba(0,0,0,0.1)';
        } else {
            // Scroll up
            sidebar.style.boxShadow = '-2px 0 8px rgba(0,0,0,0.05)';
        }
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
});

// Add active class to navigation menu based on scroll position
window.addEventListener('scroll', function() {
    let current = '';
    
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').slice(1) === current) {
            link.classList.add('active');
        }
    });
});

// Responsive hamburger menu
function setupResponsiveMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (window.innerWidth <= 768) {
        navMenu.style.display = 'none';
    } else {
        navMenu.style.display = 'flex';
    }
}

window.addEventListener('resize', setupResponsiveMenu);
window.addEventListener('load', setupResponsiveMenu);

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set today as minimum date
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('tanggal');
    if (dateInput) {
        dateInput.setAttribute('min', today);
    }
    
    // Initialize price display
    updatePrice();
    
    // Setup responsive menu
    setupResponsiveMenu();
});

// Intersection Observer for fade-in animation
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.layanan-card, .paket-card, .blog-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
});
