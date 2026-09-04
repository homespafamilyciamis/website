const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Data storage file
const bookingsFile = path.join(__dirname, 'bookings.json');

// Initialize bookings file if not exists
if (!fs.existsSync(bookingsFile)) {
    fs.writeFileSync(bookingsFile, JSON.stringify([], null, 2));
}

// Helper functions
function loadBookings() {
    try {
        const data = fs.readFileSync(bookingsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading bookings:', error);
        return [];
    }
}

function saveBookings(bookings) {
    try {
        fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving bookings:', error);
        return false;
    }
}

function generateBookingId() {
    return 'BK' + Date.now() + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateString) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

// Routes

// GET - Halaman utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST - Submit booking
app.post('/api/booking', (req, res) => {
    try {
        const { service, price, tanggal, jam, nama, whatsapp, alamat, catatan } = req.body;

        // Validasi input
        if (!service || !price || !tanggal || !jam || !nama || !whatsapp || !alamat) {
            return res.status(400).json({ 
                success: false, 
                message: 'Semua field wajib diisi' 
            });
        }

        // Validasi nomor WhatsApp
        if (!/^(\+62|62|0)[0-9]{9,12}$/.test(whatsapp.replace(/\D/g, ''))) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nomor WhatsApp tidak valid' 
            });
        }

        // Load existing bookings
        const bookings = loadBookings();

        // Create new booking
        const newBooking = {
            id: generateBookingId(),
            service,
            price,
            tanggal,
            jam,
            nama,
            whatsapp,
            alamat,
            catatan: catatan || '',
            status: 'Menunggu Konfirmasi',
            createdAt: new Date().toISOString(),
            bankDetails: {
                bank: 'Transfer Rekening',
                instruction: 'Silakan transfer ke rekening yang telah diberikan via WhatsApp'
            }
        };

        // Add to bookings
        bookings.push(newBooking);

        // Save bookings
        if (saveBookings(bookings)) {
            // Send success response
            res.json({ 
                success: true, 
                message: 'Booking berhasil disimpan',
                booking: newBooking
            });

            // Log booking
            console.log(`[${new Date().toLocaleString('id-ID')}] Booking baru: ${newBooking.id} - ${newBooking.nama}`);
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Gagal menyimpan booking' 
            });
        }
    } catch (error) {
        console.error('Error in booking:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan pada server',
            error: error.message 
        });
    }
});

// GET - Semua bookings
app.get('/api/bookings', (req, res) => {
    try {
        const bookings = loadBookings();
        res.json({ 
            success: true, 
            data: bookings,
            total: bookings.length 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil data bookings' 
        });
    }
});

// GET - Booking detail by ID
app.get('/api/booking/:id', (req, res) => {
    try {
        const bookings = loadBookings();
        const booking = bookings.find(b => b.id === req.params.id);

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking tidak ditemukan' 
            });
        }

        res.json({ 
            success: true, 
            data: booking 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil data booking' 
        });
    }
});

// PUT - Update booking status
app.put('/api/booking/:id/status', (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Menunggu Konfirmasi', 'Terkonfirmasi', 'Dalam Proses', 'Selesai', 'Dibatalkan'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Status tidak valid' 
            });
        }

        const bookings = loadBookings();
        const bookingIndex = bookings.findIndex(b => b.id === req.params.id);

        if (bookingIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking tidak ditemukan' 
            });
        }

        bookings[bookingIndex].status = status;
        bookings[bookingIndex].updatedAt = new Date().toISOString();

        if (saveBookings(bookings)) {
            res.json({ 
                success: true, 
                message: 'Status booking berhasil diperbarui',
                booking: bookings[bookingIndex]
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Gagal memperbarui status booking' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan pada server' 
        });
    }
});

// DELETE - Cancel booking
app.delete('/api/booking/:id', (req, res) => {
    try {
        const bookings = loadBookings();
        const bookingIndex = bookings.findIndex(b => b.id === req.params.id);

        if (bookingIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking tidak ditemukan' 
            });
        }

        const deletedBooking = bookings.splice(bookingIndex, 1);

        if (saveBookings(bookings)) {
            res.json({ 
                success: true, 
                message: 'Booking berhasil dibatalkan',
                booking: deletedBooking[0]
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Gagal membatalkan booking' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan pada server' 
        });
    }
});

// GET - Booking statistics
app.get('/api/stats', (req, res) => {
    try {
        const bookings = loadBookings();
        
        const stats = {
            total: bookings.length,
            pending: bookings.filter(b => b.status === 'Menunggu Konfirmasi').length,
            confirmed: bookings.filter(b => b.status === 'Terkonfirmasi').length,
            completed: bookings.filter(b => b.status === 'Selesai').length,
            cancelled: bookings.filter(b => b.status === 'Dibatalkan').length,
            totalRevenue: bookings
                .filter(b => b.status === 'Selesai')
                .reduce((sum, b) => sum + b.price, 0)
        };

        res.json({ 
            success: true, 
            data: stats 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil statistik' 
        });
    }
});

// Error handling
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Endpoint tidak ditemukan' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server Home Spa Family berjalan di http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
