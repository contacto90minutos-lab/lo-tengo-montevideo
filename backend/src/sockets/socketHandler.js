// backend/src/sockets/socketHandler.js
const { cadetesConectados, despachosActivos, cajaCadetes, baseEmpresas, pedidosGlobales } = require('../memoryDB');
const { calcularDistanciaKm } = require('../utils/helpers');

function iniciarDespachoInteligente(pedido, io) {
  let origenLat = pedido.origenLat || -34.9032;
  let origenLng = pedido.origenLng || -56.1882;

  if (pedido.rutComercio) {
    let emp = baseEmpresas.find(e => String(e.rut).trim() === String(pedido.rutComercio).trim());
    if (emp && emp.lat && emp.lng) {
      origenLat = emp.lat;
      origenLng = emp.lng;
    }
  }

  let ahora = Date.now();
  let candidatos = Object.values(cadetesConectados).filter(c => c.estado === 'libre' && (!c.penalizadoHasta || c.penalizadoHasta <= ahora));

  if (candidatos.length === 0) {
    if (io) io.emit('alerta_admin_sin_cadetes', { pedidoId: pedido.id });
    return;
  }

  candidatos.sort((a, b) => calcularDistanciaKm(origenLat, origenLng, a.lat, a.lng) - calcularDistanciaKm(origenLat, origenLng, b.lat, b.lng));

  despachosActivos[pedido.id] = {
    candidatosIndex: 0,
    candidatosList: candidatos,
    pedido: pedido,
    origenLat, origenLng
  };

  llamarSiguienteCadete(pedido.id, io);
}

function llamarSiguienteCadete(pedidoId, io) {
  let despacho = despachosActivos[pedidoId];
  if (!despacho) return;

  let { candidatosList, candidatosIndex, pedido } = despacho;

  if (candidatosIndex >= candidatosList.length) {
    if (io) io.emit('pedido_sin_respuesta_flota', { id: pedidoId });
    delete despachosActivos[pedidoId];
    return;
  }

  let cadeteActual = candidatosList[candidatosIndex];
  despacho.intentandoSocketId = cadeteActual.socketId;

  if (io) {
    io.to(cadeteActual.socketId).emit('oferta_envio_cercano', { pedido, tiempoLimiteSec: 30 });
  }

  despacho.timeoutId = setTimeout(() => {
    cadeteActual.rechazosConsecutivos = (cadeteActual.rechazosConsecutivos || 0) + 1;
    if (cadeteActual.rechazosConsecutivos >= 3) {
      cadeteActual.penalizadoHasta = Date.now() + 3600000; 
      cadeteActual.rechazosConsecutivos = 0;
      if (io) io.to(cadeteActual.socketId).emit('cuenta_suspendida', { suspensionHasta: cadeteActual.penalizadoHasta });
    }
    despacho.candidatosIndex++;
    llamarSiguienteCadete(pedidoId, io);
  }, 30000);
}

function configurarSockets(io) {
  io.on('connection', (socket) => {
    socket.on('registrar_cadete', (data) => {
      cadetesConectados[socket.id] = {
        socketId: socket.id,
        id: data.id,
        nombre: data.nombre || 'Cadete',
        lat: data.lat || -34.9032,
        lng: data.lng || -56.1882,
        estado: 'libre',
        rechazosConsecutivos: 0,
        penalizadoHasta: 0
      };
    });

    socket.on('actualizar_ubicacion_cadete', (data) => {
      if (cadetesConectados[socket.id]) {
        cadetesConectados[socket.id].lat = data.lat;
        cadetesConectados[socket.id].lng = data.lng;
      }
      io.emit('ubicacion_cadete', data);
    });

    socket.on('aceptar_oferta_pedido', (data) => {
      const { pedidoId } = data;
      let despacho = despachosActivos[pedidoId];

      if (despacho && despacho.intentandoSocketId === socket.id) {
        clearTimeout(despacho.timeoutId);
        let cadeteInfo = cadetesConectados[socket.id];
        if (cadeteInfo) {
          cadeteInfo.estado = 'ocupado';
          cadeteInfo.rechazosConsecutivos = 0;

          despacho.pedido.idCadete = cadeteInfo.id;
          despacho.pedido.nombreCadete = cadeteInfo.nombre;
          despacho.pedido.estado = 'en_camino_a_retirar';

          if (!cajaCadetes[cadeteInfo.id]) {
            cajaCadetes[cadeteInfo.id] = { gananciasEnvios: 0, propinas: 0, historial: [] };
          }
          cajaCadetes[cadeteInfo.id].gananciasEnvios += despacho.pedido.gananciaCadete;
          cajaCadetes[cadeteInfo.id].historial.push(despacho.pedido);

          io.emit('pedido_asignado', despacho.pedido);
          delete despachosActivos[pedidoId];
        }
      }
    });

    socket.on('rechazar_oferta_pedido', (data) => {
      const { pedidoId } = data;
      let despacho = despachosActivos[pedidoId];
      if (despacho && despacho.intentandoSocketId === socket.id) {
        clearTimeout(despacho.timeoutId);
        let cadete = cadetesConectados[socket.id];
        if (cadete) cadete.rechazosConsecutivos = (cadete.rechazosConsecutivos || 0) + 1;
        despacho.candidatosIndex++;
        llamarSiguienteCadete(pedidoId, io);
      }
    });

    socket.on('completar_entrega_pedido', (data) => {
      const { pedidoId } = data;
      let pedidoEncontrado = null;

      let pGlobal = pedidosGlobales.find(x => String(x.id).trim() === String(pedidoId).trim());
      if (pGlobal) {
        pedidoEncontrado = pGlobal;
      } else {
        baseEmpresas.forEach(emp => {
          if (emp.pedidos) {
            let p = emp.pedidos.find(x => String(x.id).trim() === String(pedidoId).trim());
            if (p) pedidoEncontrado = p;
          }
        });
      }

      if (!pedidoEncontrado) {
        return socket.emit('error_entrega', { message: "Pedido no encontrado" });
      }

      pedidoEncontrado.estado = 'entregado';

      Object.values(cadetesConectados).forEach(c => {
        if (c.id === pedidoEncontrado.idCadete) c.estado = 'libre';
      });

      io.emit('pedido_entregado_exito', pedidoEncontrado);
    });

    // 🆕 NUEVO: Sincronización de cambio de estado de pedidos desde comercios
    socket.on('cambiar_estado_pedido', (data) => {
      io.emit('actualizacion_pedido', data);
    });

    // 🆕 NUEVO: Propagación masiva de campañas y descuentos de IA & Ads a clientes
    socket.on('broadcast_campana_clientes', (campania) => {
      io.emit('nueva_campana_push', campania);
    });

    socket.on('disconnect', () => {
      delete cadetesConectados[socket.id];
    });
  });
}

module.exports = {
  iniciarDespachoInteligente,
  configurarSockets
};