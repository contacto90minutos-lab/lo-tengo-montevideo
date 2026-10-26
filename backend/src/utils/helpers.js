// backend/src/utils/helpers.js

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

/**
 * Calcula el costo de envío según vehículo y categoría de servicio.
 * @param {string} tipoVehiculo - 'moto' o 'camioneta'
 * @param {number} distanciaKm - Distancia total (o sumatoria de tramos en multi-puntos)
 * @param {string} categoriaServicio - 'gastronomia', 'supermercado', 'farmacia', 'estandar'
 * @param {boolean} retornoOrigen - Si requiere viaje de ida y vuelta
 */
function calcularCostoEnvio(tipoVehiculo, distanciaKm, categoriaServicio = 'gastronomia', retornoOrigen = false) {
  let distNum = parseFloat(distanciaKm) || 0;
  let distanciaEfectiva = retornoOrigen ? distNum * 2 : distNum;
  let costoEnvio = 0;

  if (tipoVehiculo === 'moto') {
    const baseKm = 5;
    // Gastronomía, Supermercados y Farmacias (hasta 15kg) -> Base $90. Otros -> Base $190.
    const esLivianoAsistido = ['gastronomia', 'supermercado', 'farmacia', 'liviano'].includes(categoriaServicio.toLowerCase());
    let precioBase = esLivianoAsistido ? 90 : 190;
    const costoKmExtra = 10;

    if (distanciaEfectiva <= baseKm) {
      costoEnvio = precioBase;
    } else {
      let kmExtra = distanciaEfectiva - baseKm;
      costoEnvio = precioBase + (Math.ceil(kmExtra) * costoKmExtra);
    }
  } else if (tipoVehiculo === 'camioneta') {
    const baseKm = 8;
    const precioBase = 390;
    const costoKmExtra = 20;

    if (distanciaEfectiva <= baseKm) {
      costoEnvio = precioBase;
    } else {
      let kmExtra = distanciaEfectiva - baseKm;
      costoEnvio = precioBase + (Math.ceil(kmExtra) * costoKmExtra);
    }
  } else {
    costoEnvio = 90;
  }
  return costoEnvio;
}

module.exports = {
  calcularDistanciaKm,
  calcularCostoEnvio
};