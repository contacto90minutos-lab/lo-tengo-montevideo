// backend/src/memoryDB.js
let pedidosGlobales = [];
let usuariosRegistrados = []; 
let cajaCadetes = {}; 
let cadetesConectados = {};
let despachosActivos = {}; 

let baseEmpresas = [
  {
    rut: '219999990012',
    nombre: 'Bar Facal (Gastronomía)',
    giro: 'Gastronomía',
    logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    telefono: '099000000',
    direccion: 'Av. 18 de Julio 1249, Centro',
    horaApertura: '08:00',
    horaCierre: '23:59',
    lat: -34.9056, lng: -56.1901,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    suscripcionDestacadosActiva: true,
    productos: [
      { id: 101, nombre: "Chivito al Plato Clásico con Papas Fritas", precio: 480, imagen: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 102, nombre: "Empanadas de Carne Cortada a Cuchillo (Docena)", precio: 520, imagen: "https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  },
  {
    rut: '218888880014',
    nombre: 'Disco Supermercado (Pocitos)',
    giro: 'Supermercado',
    logo: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80',
    telefono: '099111111',
    direccion: 'Av. 21 de Setiembre 2259, Pocitos',
    horaApertura: '08:00',
    horaCierre: '22:00',
    lat: -34.9165, lng: -56.1550,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    suscripcionDestacadosActiva: false,
    productos: [
      { id: 201, nombre: "Canasta Básica de Alimentos Familiar", precio: 890, imagen: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 202, nombre: "Yogures y Lácteos Seleccionados (Outlet)", precio: 190, imagen: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  },
  {
    rut: '217777770025',
    nombre: 'Farmashop (Pocitos)',
    giro: 'Farmacia',
    logo: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
    telefono: '099222222',
    direccion: 'Av. Brasil 3097, Pocitos',
    horaApertura: '08:00',
    horaCierre: '22:00',
    lat: -34.9150, lng: -56.1480,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    suscripcionDestacadosActiva: false,
    productos: [
      { id: 301, nombre: "Kit Primeros Auxilios & Analgésicos", precio: 450, imagen: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 302, nombre: "Protector Solar Factor 50 (Último Stock)", precio: 350, imagen: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  },
  {
    rut: '216666660038',
    nombre: 'Punta Carretas Modas',
    giro: 'Indumentaria',
    logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=400&q=80',
    telefono: '099333333',
    direccion: 'Ellauri 350, Punta Carretas Shopping',
    horaApertura: '10:00',
    horaCierre: '22:00',
    lat: -34.9222, lng: -56.1578,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    suscripcionDestacadosActiva: true,
    productos: [
      { id: 401, nombre: "Buzo Canguro Algodón Premium Invierno", precio: 1290, imagen: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 402, nombre: "Remeras Básicas Verano (Liquidación Outlet)", precio: 390, imagen: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  },
  {
    rut: '215555550049',
    nombre: 'Montevideo Tech & Store',
    giro: 'Tecnología',
    logo: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=400&q=80',
    telefono: '099444444',
    direccion: 'Dr. Luis Alberto de Herrera 1290, Montevideo Shopping',
    horaApertura: '10:00',
    horaCierre: '22:00',
    lat: -34.8985, lng: -56.1352,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    suscripcionDestacadosActiva: false,
    productos: [
      { id: 501, nombre: "Auriculares Inalámbricos Bluetooth TWS", precio: 990, imagen: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 502, nombre: "Cargadores Rápidos USB-C (Caja Abierta Outlet)", precio: 290, imagen: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
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