const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Archivo de persistencia local en el servidor para que no se borre al recargar
const DB_FILE = path.join(__dirname, 'db_lotengo.json');

let datosSistema = {
  pedidosGlobales: [],
  usuariosRegistrados: [],
  baseEmpresas: [
    {
      rut: '219999990012',
      nombre: 'Lo Tengo Chivitería Central',
      giro: 'Gastronomía',
      logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
      telefono: '099000000',
      direccion: 'Av. 18 de Julio 1300',
      password: '123',
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
      password: '123',
      productos: [
        { id: 201, nombre: "Canasta Básica de Alimentos", precio: 890, imagen: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
        { id: 202, nombre: "Pack Leche Descremada x6", precio: 290, imagen: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
      ],
      pedidos: []
    },
    {
      rut: '217777770016',
      nombre: 'Farmacia San Roque 24hs',
      giro: 'Farmacia',
      logo: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
      telefono: '099222222',
      direccion: 'Av. 21 de Setiembre 2400',
      password: '123',
      productos: [
        { id: 301, nombre: "Protector Solar SPF 50+", precio: 750, imagen: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
        { id: 302, nombre: "Kit Primeros Auxilios Completo", precio: 450, imagen: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
      ],
      pedidos: []
    }
  ]
};

// Cargar datos persistentes si existen
function cargarDatosDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const contenido = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(contenido);
      if (parsed.baseEmpresas) datosSistema.baseEmpresas = parsed.baseEmpresas;
      if (parsed.pedidosGlobales) datosSistema.pedidosGlobales = parsed.pedidosGlobales;
      if (parsed.usuariosRegistrados) datosSistema.usuariosRegistrados = parsed.usuariosRegistrados;
      console.log("📂 Datos cargados desde archivo persistente en servidor.");
    }
  } catch (e) {
    console.error("Error cargando DB local:", e);
  }
}

function guardarDatosDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(datosSistema, null, 2), 'utf8');
  } catch (e) {
    console.error("Error guardando DB local:", e);
  }
}

cargarDatosDB();

// Ubicación de archivos estáticos
const rootDir = path.resolve(__dirname, '../../');
app.use(express.static(path.join(rootDir, 'cliente/public')));
app.use('/empresa', express.static(path.join(rootDir, 'empresa')));
app.use('/cadete', express.static(path.join(rootDir, 'cadete')));
app.use('/admin', express.static(path.join(rootDir, 'admin')));

app.get('/empresa', (req, res) => res.sendFile(path.join(rootDir, 'empresa/index.html')));
app.get('/cadete', (req, res) => res.sendFile(path.join(rootDir, 'cadete/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(rootDir, 'admin/index.html')));

// API EMPRESAS
app.get('/api/empresas', (req, res) => {
  res.json(datosSistema.baseEmpresas);
});

app.post('/api/empresas/registro', (req, res) => {
  const nuevaEmpresa = req.body;
  if (!nuevaEmpresa || !nuevaEmpresa.rut) {
    return res.status(400).json({ success: false, message: "RUT obligatorio" });
  }

  let index = datosSistema.baseEmpresas.findIndex(e => String(e.rut).trim() === String(nuevaEmpresa.rut).trim());
  if (index !== -1) {
    datosSistema.baseEmpresas[index] = { ...datosSistema.baseEmpresas[index], ...nuevaEmpresa };
  } else {
    datosSistema.baseEmpresas.push({
      ...nuevaEmpresa,
      productos: nuevaEmpresa.productos || [],
      pedidos: nuevaEmpresa.pedidos || []
    });
  }

  guardarDatosDB();
  io.emit('empresa_actualizada', nuevaEmpresa);
  res.json({ success: true, empresa: nuevaEmpresa });
});

app.post('/api/empresas/:rut/catalogo', (req, res) => {
  const { rut } = req.params;
  const { productos } = req.body;

  let emp = datosSistema.baseEmpresas.find(e => String(e.rut).trim() === String(rut).trim());
  if (emp) {
    emp.productos = productos || [];
    guardarDatosDB();
    io.emit('catalogo_actualizado', { rut, productos: emp.productos });
    return res.json({ success: true, productos: emp.productos });
  }

  res.status(404).json({ success: false, message: "Empresa no encontrada" });
});

app.get('/api/empresas/:rut/catalogo', (req, res) => {
  const { rut } = req.params;
  let emp = datosSistema.baseEmpresas.find(e => String(e.rut).trim() === String(rut).trim());
  res.json(emp ? emp.productos : []);
});

// API PEDIDOS (Evitando valores undefined)
app.get('/api/pedidos', (req, res) => {
  let todos = [...datosSistema.pedidosGlobales];
  datosSistema.baseEmpresas.forEach(emp => {
    if (emp.pedidos) todos.push(...emp.pedidos);
  });
  res.json(todos);
});

app.post('/api/pedidos', (req, res) => {
  const nuevoPedido = req.body;
  if (!nuevoPedido.cliente) nuevoPedido.cliente = "Cliente General";
  if (!nuevoPedido.total) nuevoPedido.total = 0;
  if (!nuevoPedido.codigoVerificacion) nuevoPedido.codigoVerificacion = Math.floor(1000 + Math.random() * 9000);

  datosSistema.pedidosGlobales.push(nuevoPedido);

  let empDestino = datosSistema.baseEmpresas[0];
  if (nuevoPedido.rutComercio) {
    let encontrada = datosSistema.baseEmpresas.find(e => String(e.rut).trim() === String(nuevoPedido.rutComercio).trim());
    if (encontrada) empDestino = encontrada;
  }

  if (!empDestino.pedidos) empDestino.pedidos = [];
  empDestino.pedidos.push(nuevoPedido);

  guardarDatosDB();
  io.emit('nuevo_pedido_servidor', nuevoPedido);
  res.status(201).json({ success: true, pedido: nuevoPedido });
});

// WebSockets
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
  console.log(`Socket conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Socket desconectado: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor LO TENGO operativo en puerto ${PORT}`);
});