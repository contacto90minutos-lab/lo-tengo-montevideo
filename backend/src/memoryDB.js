// backend/src/memoryDB.js
let pedidosGlobales = [];
let usuariosRegistrados = []; 
let cajaCadetes = {}; 
let cadetesConectados = {};
let despachosActivos = {}; 

let baseEmpresas = [
  {
    rut: '219999990012',
    nombre: 'Lo Tengo Chivitería Central',
    giro: 'Gastronomía',
    logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    telefono: '099000000',
    direccion: 'Av. 18 de Julio 1300',
    horaApertura: '11:00',
    horaCierre: '23:59',
    lat: -34.9032, lng: -56.1882,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    suscripcionDestacadosActiva: true,
    productos: [
      { id: 101, nombre: "Chivito al Plato Clásico", precio: 480, imagen: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 102, nombre: "Empanadas de Carne (Docena)", precio: 520, imagen: "https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  },
  {
    rut: '218888880014',
    nombre: 'Supermercado El Dorado Express',
    giro: 'Supermercado',
    logo: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80',
    telefono: '099111111',
    direccion: 'Bv. General Artigas 1800',
    horaApertura: '08:00',
    horaCierre: '22:00',
    lat: -34.8911, lng: -56.1685,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    suscripcionDestacadosActiva: false,
    productos: [
      { id: 201, nombre: "Canasta Básica de Alimentos", precio: 890, imagen: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true }
    ],
    pedidos: []
  }
];

module.exports = {
  pedidosGlobales,
  usuariosRegistrados,
  cajaCadetes,
  cadetesConectados,
  despachosActivos,
  baseEmpresas
};