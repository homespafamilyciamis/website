// Update tanggal minimum ke hari ini
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tanggal').setAttribute('min', today);
});

// Fungsi untuk update harga
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

// Fungsi untuk booking dari paket
function bookingPackage(packageName, price, duration) {
    document.getElementById('booking-modal').style.display = 'block';
    
    // Set service
    const serviceSelect = document.getElementById('service');
    for (let i = 0; i < serviceSelect.options.length; i++) {
        if (serviceSelect.options[i].text.includes(packageName)) {
            serviceSelect.value = serviceSelect.options[i].value;
            break;
        }
    }
    
    // Update price
    document.getElementById('total-price').textContent = 'Rp ' + price.toLocaleString('id-ID');
    
    // Scroll ke modal
    document.querySelector('.modal-content').scrollIntoView({behavior: 'smooth', block: 'center'});
}

// Submit form booking
async function submitBooking(event) {
    event.preventDefault();
    
    const serviceSelect = document.getElementById('service');
    const [serviceName, price] = serviceSelect.value.split('|');
    
    const bookingData = {
        service: serviceName,
        price: parseInt(price) * 1000,
        tanggal: document.getElementById('tanggal').value,
        jam: document.getElementById('jam').value,
        nama: document.getElementById('nama').value,
        whatsapp: document.getElementById('whatsapp').value,
        alamat: document.getElementById('alamat').value,
        catatan: document.getElementById('catatan').value
    };
    
    // Validasi
    if (!bookingData.service || !bookingData.tanggal || !bookingData.jam || !bookingData.nama || !bookingData.whatsapp || !bookingData.alamat) {
        alert('Mohon lengkapi semua field yang wajib diisi!');
        return;
    }
    
    try {
        // Kirim ke backend
        const response = await fetch('/api/booking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bookingData)
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Tampilkan pesan sukses
            alert('Booking berhasil! Silakan transfer ke rekening yang telah diberikan.');
            
            // Buka WhatsApp untuk konfirmasi
            const message = `Halo Home Spa Family, saya ingin melakukan booking:\n\n` +
                `Layanan: ${bookingData.service}\n` +
                `Tanggal: ${bookingData.tanggal}\n` +
                `Jam: ${bookingData.jam}\n` +
                `Nama: ${bookingData.nama}\n` +
                `Alamat: ${bookingData.alamat}\n` +
                `Total Harga: Rp ${bookingData.price.toLocaleString('id-ID')}\n\n` +
                `${bookingData.catatan ? 'Catatan: ' + bookingData.catatan : ''}`;
            
            const encodedMessage = encodeURIComponent(message);
            window.open(`https://wa.me/6283195585892?text=${encodedMessage}`, '_blank');
            
            // Reset form
            document.getElementById('booking-form').reset();
            document.getElementById('total-price').textContent = 'Rp 0';
            document.getElementById('booking-modal').style.display = 'none';
        } else {
            alert('Ada kesalahan saat melakukan booking. Silakan coba lagi.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan. Silakan coba lagi.');
    }
}

// Mobile menu toggle
document.querySelector('.hamburger').addEventListener('click', function() {
    const navMenu = document.querySelector('.nav-menu');
    navMenu.style.display = navMenu.style.display === 'flex' ? 'none' : 'flex';
});

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('booking-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Smooth scroll untuk anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({behavior: 'smooth'});
        }
    });
});
