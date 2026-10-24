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

function calcularCostoEnvio(tipoVehiculo, distanciaKm, retornoOrigen = false) {
  let distNum = parseFloat(distanciaKm) || 0;
  let distanciaEfectiva = retornoOrigen ? distNum * 2 : distNum;
  let costoEnvio = 0;

  if (tipoVehiculo === 'moto') {
    const baseKm = 5;
    const precioBase = 90; // Tarifa base corregida a $90 UYU
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