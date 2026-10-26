// backend/src/routes/pedidos.js
const express = require('express');
const router = express.Router();
const { pedidosGlobales, baseEmpresas } = require('../memoryDB');
const { calcularCostoEnvio } = require('../utils/helpers');

router.post('/cotizar', (req, res) => {
  const { tipoVehiculo, distanciaKm, retornoOrigen } = req.body;
  if (!tipoVehiculo || distanciaKm === undefined) {
    return res.status(400).json({ success: false, message: "Datos incompletos para cotizar" });
  }
  const costoEnvio = calcularCostoEnvio(tipoVehiculo, parseFloat(distanciaKm), Boolean(retornoOrigen));
  res.json({ success: true, costoTotalEnvio: costoEnvio });
});

router.get('/', (req, res) => {
  let todosLosPedidos = [...pedidosGlobales];
  let idsSet = new Set(todosLosPedidos.map(p => String(p.id).trim()));

  baseEmpresas.forEach(emp => { 
    if (emp.pedidos && Array.isArray(emp.pedidos)) {
      emp.pedidos.forEach(p => {
        let idStr = String(p.id).trim();
        if (!idsSet.has(idStr)) {
          idsSet.add(idStr);
          todosLosPedidos.push(p);
        }
      });
    }
  });
  res.json(todosLosPedidos);
});

router.post('/', (req, res) => {
  const nuevoPedido = req.body; 
  if (!nuevoPedido.id) nuevoPedido.id = Date.now();
  
  // Generar PIN de seguridad de 4 dígitos para comercios
  nuevoPedido.pinSeguridad = Math.floor(1000 + Math.random() * 9000).toString();

  // Determinar tipo de servicio si no viene especificado
  if (!nuevoPedido.tipoServicio) {
    if (nuevoPedido.rutComercio && nuevoPedido.productos && nuevoPedido.productos.length > 0) {
      nuevoPedido.tipoServicio = 'comercio';
    } else if (nuevoPedido.tipoPedido === 'tres_cruces' || nuevoPedido.destino === 'Tres Cruces') {
      nuevoPedido.tipoServicio = 'tres_cruces';
    } else {
      nuevoPedido.tipoServicio = 'express_ab';
    }
  }

  // Manejo de Estado Inicial: Inmediato vs Programado
  const esProgramado = Boolean(nuevoPedido.esProgramado);
  if (esProgramado) {
    nuevoPedido.estado = 'programado';
  } else {
    nuevoPedido.estado = 'pago_confirmado';
  }

  let distanciaCalculo = parseFloat(nuevoPedido.distanciaKm || nuevoPedido.distancia || 0);
  let vehiculoCalculo = nuevoPedido.tipoVehiculo || nuevoPedido.vehiculo || 'moto';

  if (distanciaCalculo > 0) {
    nuevoPedido.valorEnvio = calcularCostoEnvio(
      vehiculoCalculo, 
      distanciaCalculo, 
      Boolean(nuevoPedido.retornoOrigen)
    );
  }

  let comisionComercio = nuevoPedido.valorProducto ? (nuevoPedido.valorProducto * 0.10) : 0; 
  let comisionEnvio = nuevoPedido.valorEnvio ? (nuevoPedido.valorEnvio * 0.30) : 0; 
  let gananciaCadete = nuevoPedido.valorEnvio ? (nuevoPedido.valorEnvio - comisionEnvio) : (nuevoPedido.total ? (nuevoPedido.total * 0.70) : 140);

  nuevoPedido.comisionesLoTengo = {
    comercio: comisionComercio,
    envio: comisionEnvio,
    totalPlataforma: comisionComercio + comisionEnvio
  };
  nuevoPedido.gananciaCadete = gananciaCadete;

  // Enrutar según tipo de servicio
  if (nuevoPedido.tipoServicio === 'comercio' && nuevoPedido.rutComercio) {
    let empresaDestino = baseEmpresas.find(e => String(e.rut).trim() === String(nuevoPedido.rutComercio).trim());
    if (!empresaDestino) {
      empresaDestino = baseEmpresas[0];
      nuevoPedido.rutComercio = empresaDestino.rut;
    }

    if (!empresaDestino.pedidos) empresaDestino.pedidos = [];
    let indexExistente = empresaDestino.pedidos.findIndex(p => String(p.id).trim() === String(nuevoPedido.id).trim());
    if (indexExistente !== -1) {
      empresaDestino.pedidos[indexExistente] = nuevoPedido;
    } else {
      empresaDestino.pedidos.push(nuevoPedido);
    }
  } else {
    // Express A-B o Tres Cruces van a globales (sin mezclar en paneles de tiendas)
    nuevoPedido.rutComercio = null;
    pedidosGlobales.push(nuevoPedido);
  }

  const io = req.app.get('io');
  if (io) io.emit('nuevo_pedido_servidor', nuevoPedido);

  // Si NO es programado, iniciamos el despacho inteligente de inmediato
  if (!esProgramado) {
    const { iniciarDespachoInteligente } = require('../sockets/socketHandler');
    if (iniciarDespachoInteligente) iniciarDespachoInteligente(nuevoPedido, io);
  }

  res.status(201).json({ success: true, pedido: nuevoPedido });
});

// NUEVA RUTA: Actualización de estado y cierre blindado con validaciones (Fin del bucle)
router.put('/:id/estado', (req, res) => {
  const { id } = req.params;
  const { estado, pinIngresado, nombreReceptor, ciReceptor, fotoRemito, calificacion, comentario } = req.body;
  
  let pedidoEncontrado = null;

  // Buscar en pedidosGlobales
  let idxGlobal = pedidosGlobales.findIndex(p => String(p.id).trim() === String(id).trim());
  if (idxGlobal !== -1) {
    pedidoEncontrado = pedidosGlobales[idxGlobal];
  } else {
    // Buscar en baseEmpresas
    for (let emp of baseEmpresas) {
      if (emp.pedidos) {
        let idx = emp.pedidos.findIndex(p => String(p.id).trim() === String(id).trim());
        if (idx !== -1) {
          pedidoEncontrado = emp.pedidos[idx];
          break;
        }
      }
    }
  }

  if (!pedidoEncontrado) {
    return res.status(404).json({ success: false, message: "Pedido no encontrado" });
  }

  // Si se intenta cerrar el pedido, aplicar validación estricta según el tipo de servicio
  if (estado === 'entregado_cerrado') {
    const servicio = pedidoEncontrado.tipoServicio || (pedidoEncontrado.rutComercio ? 'comercio' : 'express_ab');

    if (servicio === 'comercio') {
      if (!pinIngresado || String(pinIngresado).trim() !== String(pedidoEncontrado.pinSeguridad).trim()) {
        return res.status(400).json({ success: false, message: "PIN de seguridad incorrecto. Verifique con el cliente." });
      }
    } else if (servicio === 'express_ab') {
      if (!nombreReceptor || !ciReceptor) {
        return res.status(400).json({ success: false, message: "Debe ingresar el Nombre y la Cédula (CI) de quien recibe." });
      }
      pedidoEncontrado.nombreReceptor = nombreReceptor;
      pedidoEncontrado.ciReceptor = ciReceptor;
    } else if (servicio === 'tres_cruces') {
      if (!fotoRemito) {
        return res.status(400).json({ success: false, message: "La foto del ticket/remito de la agencia es obligatoria." });
      }
      pedidoEncontrado.fotoRemito = fotoRemito;
    }

    pedidoEncontrado.estado = 'entregado_cerrado';
    if (calificacion) pedidoEncontrado.calificacion = calificacion;
    if (comentario) pedidoEncontrado.comentario = comentario;
  } else if (estado) {
    pedidoEncontrado.estado = estado;
  }

  const io = req.app.get('io');
  if (io) io.emit('pedido_actualizado', pedidoEncontrado);

  res.json({ success: true, pedido: pedidoEncontrado });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  let eliminado = false;

  let idxGlobal = pedidosGlobales.findIndex(p => String(p.id).trim() === String(id).trim());
  if (idxGlobal !== -1) {
    pedidosGlobales.splice(idxGlobal, 1);
    eliminado = true;
  }

  baseEmpresas.forEach(emp => {
    if (emp.pedidos) {
      let idx = emp.pedidos.findIndex(p => String(p.id).trim() === String(id).trim());
      if (idx !== -1) {
        emp.pedidos.splice(idx, 1);
        eliminado = true;
      }
    }
  });

  if (eliminado) {
    if (req.app.get('io')) req.app.get('io').emit('pedido_cancelado_admin', { id });
    return res.json({ success: true, message: "Pedido eliminado correctamente" });
  }
  res.status(404).json({ success: false, message: "Pedido no encontrado" });
});

module.exports = router;