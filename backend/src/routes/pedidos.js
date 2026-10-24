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
  
  nuevoPedido.pinSeguridad = Math.floor(1000 + Math.random() * 9000).toString();
  nuevoPedido.estado = 'pago_confirmado'; 

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

  const esExpressAB = (
    nuevoPedido.tipoPedido === 'express' || 
    !nuevoPedido.rutComercio || 
    nuevoPedido.rutComercio === '' || 
    !nuevoPedido.productos || 
    nuevoPedido.productos.length === 0
  );

  if (esExpressAB) {
    nuevoPedido.rutComercio = null;
    pedidosGlobales.push(nuevoPedido);
  } else {
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
  }

  const io = req.app.get('io');
  if (io) io.emit('nuevo_pedido_servidor', nuevoPedido);

  const { iniciarDespachoInteligente } = require('../sockets/socketHandler');
  if (iniciarDespachoInteligente) iniciarDespachoInteligente(nuevoPedido, io);

  res.status(201).json({ success: true, pedido: nuevoPedido });
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