// ============================================================
// HOME SPA FAMILY — PUBLIC SCRIPT
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
    initDateInput();
    updatePrice();
    setupResponsiveMenu();
    setupMobileMenu();
    setupSmoothScroll();
    setupNavActiveState();
    setupScrollEffect();
    setupAnimations();
});

// ============================================================
// SET MINIMUM DATE
// Menggunakan tanggal lokal agar aman untuk WIB
// ============================================================

function getLocalDateString() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function initDateInput() {
    const dateInput = document.getElementById('tanggal');

    if (!dateInput) return;

    dateInput.setAttribute('min', getLocalDateString());
}

// ============================================================
// UPDATE TOTAL PRICE
// ============================================================

function updatePrice() {
    const serviceSelect = document.getElementById('service');
    const totalPrice = document.getElementById('total-price');

    if (!serviceSelect || !totalPrice) return;

    const selectedOption =
        serviceSelect.options[serviceSelect.selectedIndex];

    if (selectedOption && selectedOption.value) {
        const parts = selectedOption.value.split('|');

        const price = parts[1] || '0';
        const priceInRupiah = parseInt(price, 10) * 1000;

        if (!isNaN(priceInRupiah)) {
            totalPrice.textContent =
                'Rp ' + priceInRupiah.toLocaleString('id-ID');
        } else {
            totalPrice.textContent = 'Rp 0';
        }
    } else {
        totalPrice.textContent = 'Rp 0';
    }
}

// ============================================================
// FORMAT CURRENCY
// ============================================================

function formatCurrency(value) {
    const number = Number(value) || 0;

    return 'Rp ' + number.toLocaleString('id-ID');
}

// ============================================================
// FORMAT DATE INDONESIA
// ============================================================

function formatDate(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString + 'T00:00:00');

    if (isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// ============================================================
// VALIDASI NOMOR WHATSAPP
// ============================================================

function validateWhatsAppNumber(value) {
    if (!value) return false;

    const cleaned = value.replace(/[^0-9+]/g, '');
    const digits = cleaned.replace(/^\+/, '');

    return digits.length >= 9;
}

// ============================================================
// MEMBUAT PESAN WHATSAPP
// ============================================================

function createWhatsAppMessage(bookingData) {
    return encodeURIComponent(
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
}

// ============================================================
// OPEN WHATSAPP
// ============================================================

function openWhatsApp(message) {
    const phoneNumber = '6283195585892';

    const url =
        `https://wa.me/${phoneNumber}?text=${message}`;

    window.open(url, '_blank', 'noopener,noreferrer');
}

// ============================================================
// SUBMIT BOOKING FORM
// ============================================================

async function submitBooking(event) {
    event.preventDefault();

    const form = document.getElementById('booking-form');
    const serviceSelect = document.getElementById('service');
    const submitButton =
        form?.querySelector('button[type="submit"]');

    if (!serviceSelect) {
        alert('Form booking tidak ditemukan.');
        return;
    }

    const selectedOption =
        serviceSelect.options[serviceSelect.selectedIndex];

    // --------------------------------------------------------
    // Validasi layanan
    // --------------------------------------------------------

    if (!selectedOption || !selectedOption.value) {
        alert('Mohon pilih layanan terlebih dahulu!');
        serviceSelect.focus();
        return;
    }

    const parts = selectedOption.value.split('|');

    const serviceName = parts[0] || '';
    const price = parseInt(parts[1], 10) || 0;

    // --------------------------------------------------------
    // Ambil data form
    // --------------------------------------------------------

    const bookingData = {
        service: serviceName.trim(),
        price: price * 1000,
        tanggal: document.getElementById('tanggal')?.value || '',
        jam: document.getElementById('jam')?.value || '',
        durasi: document.getElementById('durasi')?.value || '',
        nama: document.getElementById('nama')?.value.trim() || '',
        whatsapp:
            document.getElementById('whatsapp')?.value.trim() || '',
        alamat:
            document.getElementById('alamat')?.value.trim() || ''
    };

    // --------------------------------------------------------
    // Validasi field wajib
    // --------------------------------------------------------

    if (
        !bookingData.tanggal ||
        !bookingData.jam ||
        !bookingData.nama ||
        !bookingData.whatsapp ||
        !bookingData.alamat
    ) {
        alert('Mohon lengkapi semua field yang wajib diisi!');
        return;
    }

    // --------------------------------------------------------
    // Validasi tanggal
    // --------------------------------------------------------

    const today = getLocalDateString();

    if (bookingData.tanggal < today) {
        alert('Tanggal booking tidak boleh sebelum hari ini.');
        document.getElementById('tanggal')?.focus();
        return;
    }

    // --------------------------------------------------------
    // Validasi WhatsApp
    // --------------------------------------------------------

    if (!validateWhatsAppNumber(bookingData.whatsapp)) {
        alert('Mohon masukkan nomor WhatsApp yang valid.');
        document.getElementById('whatsapp')?.focus();
        return;
    }

    // --------------------------------------------------------
    // Loading state
    // --------------------------------------------------------

    let originalButtonText = '';

    if (submitButton) {
        originalButtonText = submitButton.textContent;

        submitButton.disabled = true;
        submitButton.textContent = 'MEMPROSES BOOKING...';

        submitButton.style.opacity = '0.7';
        submitButton.style.cursor = 'wait';
    }

    try {
        // ----------------------------------------------------
        // Kirim data ke backend
        // ----------------------------------------------------

        const response = await fetch('/api/booking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bookingData)
        });

        let result = null;

        try {
            result = await response.json();
        } catch (_) {
            result = null;
        }

        // ----------------------------------------------------
        // Booking backend berhasil
        // ----------------------------------------------------

        if (response.ok) {
            const whatsappMessage =
                createWhatsAppMessage(bookingData);

            alert(
                '✅ Booking berhasil dikirim!\n\n' +
                'Silakan lanjutkan ke WhatsApp untuk konfirmasi jadwal.'
            );

            openWhatsApp(whatsappMessage);

            if (form) {
                form.reset();
            }

            const totalPrice =
                document.getElementById('total-price');

            if (totalPrice) {
                totalPrice.textContent = 'Rp 0';
            }

            return;
        }

        // ----------------------------------------------------
        // Backend memberikan error
        // ----------------------------------------------------

        console.error(
            'Booking API error:',
            result || response.status
        );

        /*
         * Jangan langsung menganggap booking gagal total.
         * Data tetap bisa dikirim ke WhatsApp agar pelanggan
         * tidak kehilangan data booking.
         */

        const whatsappMessage =
            createWhatsAppMessage(bookingData);

        alert(
            '⚠️ Sistem booking sedang mengalami kendala.\n\n' +
            'Data booking akan tetap diarahkan ke WhatsApp untuk konfirmasi.'
        );

        openWhatsApp(whatsappMessage);

    } catch (error) {

        // ----------------------------------------------------
        // Network error
        // ----------------------------------------------------

        console.error('Booking error:', error);

        /*
         * Jika internet/API bermasalah, tetap bantu pelanggan
         * melanjutkan booking melalui WhatsApp.
         */

        const whatsappMessage =
            createWhatsAppMessage(bookingData);

        alert(
            '⚠️ Koneksi ke sistem booking sedang bermasalah.\n\n' +
            'Silakan lanjutkan booking melalui WhatsApp.'
        );

        openWhatsApp(whatsappMessage);

    } finally {

        // ----------------------------------------------------
        // Kembalikan tombol
        // ----------------------------------------------------

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent =
                originalButtonText || 'KONFIRMASI VIA WHATSAPP';

            submitButton.style.opacity = '';
            submitButton.style.cursor = '';
        }
    }
}

// ============================================================
// MOBILE MENU
// ============================================================

function setupMobileMenu() {
    const hamburger =
        document.querySelector('.hamburger');

    const navMenu =
        document.querySelector('.nav-menu');

    if (!hamburger || !navMenu) return;

    hamburger.addEventListener('click', function () {

        const isOpen =
            navMenu.classList.contains('menu-open');

        if (isOpen) {
            navMenu.classList.remove('menu-open');
            navMenu.style.display = 'none';
        } else {
            navMenu.classList.add('menu-open');
            navMenu.style.display = 'flex';
        }
    });

    // Tutup menu ketika klik link
    navMenu.querySelectorAll('a').forEach(function (link) {

        link.addEventListener('click', function () {

            if (window.innerWidth <= 768) {
                navMenu.classList.remove('menu-open');
                navMenu.style.display = 'none';
            }
        });
    });
}

// ============================================================
// RESPONSIVE MENU
// ============================================================

function setupResponsiveMenu() {
    const hamburger =
        document.querySelector('.hamburger');

    const navMenu =
        document.querySelector('.nav-menu');

    if (!hamburger || !navMenu) return;

    if (window.innerWidth <= 768) {

        // Jangan membuka menu otomatis
        if (!navMenu.classList.contains('menu-open')) {
            navMenu.style.display = 'none';
        }

    } else {

        navMenu.classList.remove('menu-open');
        navMenu.style.display = 'flex';
    }
}

window.addEventListener(
    'resize',
    setupResponsiveMenu
);

// ============================================================
// SMOOTH SCROLL
// ============================================================

function setupSmoothScroll() {

    document
        .querySelectorAll('a[href^="#"]')
        .forEach(function (anchor) {

            anchor.addEventListener('click', function (event) {

                const href =
                    this.getAttribute('href');

                if (!href || href === '#') {
                    return;
                }

                const target =
                    document.querySelector(href);

                if (!target) {
                    return;
                }

                event.preventDefault();

                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            });
        });
}

// ============================================================
// ACTIVE NAVIGATION
// ============================================================

function setupNavActiveState() {

    const navLinks =
        document.querySelectorAll('.nav-menu a');

    if (!navLinks.length) return;

    const sections =
        document.querySelectorAll('section[id]');

    function updateActiveNavigation() {

        let current = '';

        const scrollPosition =
            window.scrollY + 180;

        sections.forEach(function (section) {

            const sectionTop =
                section.offsetTop;

            const sectionHeight =
                section.offsetHeight;

            if (
                scrollPosition >= sectionTop &&
                scrollPosition < sectionTop + sectionHeight
            ) {
                current =
                    section.getAttribute('id');
            }
        });

        navLinks.forEach(function (link) {

            link.classList.remove('active');

            const href =
                link.getAttribute('href');

            if (
                href &&
                href.startsWith('#') &&
                href.substring(1) === current
            ) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener(
        'scroll',
        updateActiveNavigation,
        { passive: true }
    );

    updateActiveNavigation();
}

// ============================================================
// SIDEBAR SCROLL EFFECT
// ============================================================

function setupScrollEffect() {

    const sidebar =
        document.querySelector('.booking-sidebar');

    if (!sidebar) return;

    let lastScrollTop = 0;

    window.addEventListener(
        'scroll',
        function () {

            const scrollTop =
                window.pageYOffset ||
                document.documentElement.scrollTop;

            if (scrollTop > lastScrollTop) {

                sidebar.style.boxShadow =
                    '-2px 0 12px rgba(0,0,0,0.10)';

            } else {

                sidebar.style.boxShadow =
                    '-2px 0 8px rgba(0,0,0,0.05)';
            }

            lastScrollTop =
                scrollTop <= 0 ? 0 : scrollTop;
        },
        { passive: true }
    );
}

// ============================================================
// ANIMATION
// ============================================================

function setupAnimations() {

    if (!('IntersectionObserver' in window)) {
        return;
    }

    const elements =
        document.querySelectorAll(
            '.layanan-card, .paket-card, .blog-card, .service, .package-card, .feature-item'
        );

    if (!elements.length) {
        return;
    }

    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -80px 0px'
    };

    const observer =
        new IntersectionObserver(
            function (entries) {

                entries.forEach(function (entry) {

                    if (entry.isIntersecting) {

                        entry.target.style.opacity = '1';
                        entry.target.style.transform =
                            'translateY(0)';

                        observer.unobserve(
                            entry.target
                        );
                    }
                });

            },
            observerOptions
        );

    elements.forEach(function (element) {

        element.style.opacity = '0';

        element.style.transform =
            'translateY(20px)';

        element.style.transition =
            'opacity 0.5s ease, transform 0.5s ease';

        observer.observe(element);
    });
}

// ============================================================
// GLOBAL FUNCTION
// Supaya HTML onchange="updatePrice()" tetap bekerja.
// ============================================================

window.updatePrice = updatePrice;
window.submitBooking = submitBooking;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
