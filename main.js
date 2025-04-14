
const socket = new WebSocket("wss://tarea-2.2025-1.tallerdeintegracion.cl/connect");
let lanzamientosActivos = [];


let satelitesActivos = [];
let zonasCobertura = [];
let mostrarCobertura = false;
let globe;

const DSN_ANTENNAS = [
  { name: "Goldstone", lat: 35.4267, lon: -116.8900 },
  { name: "Madrid", lat: 40.4314, lon: -4.2481 },
  { name: "Canberra", lat: -35.4014, lon: 148.9817 }
];


window.addEventListener("DOMContentLoaded", () => {
      globe = Globe()
      (document.getElementById("globeViz"))
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
      .backgroundColor("#000");
      globe.width(window.innerWidth * 0.5).height(window.innerHeight * 0.85);

    globe
    .pointsData(DSN_ANTENNAS)
    .pointLat(d => d.lat)
    .pointLng(d => d.lon)
    .pointAltitude(0.01) // Qué tan alto "flota" el punto
    .pointColor(() => 'red') // Color rojo para las antenas
    .pointLabel(d => d.name); // Tooltip al pasar el mouse

    globe.onPointClick(info => {
      //CUando tengamos el launch site hay que cambiar el orden de los if
      if (!info.isSatellite) {
        mostrarCoberturaAntena(info);
      } else if (info.isSatellite) {
        mostrarDetalleSatelite(info);
      }
    });
    

    document.getElementById("toggleZonas").addEventListener("click", () => {
      mostrarCobertura = !mostrarCobertura;
      actualizarGlobo();
    document.getElementById("toggleZonas").textContent = mostrarCobertura ? "Ocultar Zonas" : "Zonas";
    });

    document.getElementById("toggleDSN").addEventListener("click", () => {
      alert("Aquí podrías mostrar/ocultar las antenas DSN");
    });
    
    document.getElementById("toggleEventos").addEventListener("click", () => {
      alert("Aquí podrías mostrar la lista de eventos del WebSocket");
    });

});



socket.onopen = () => {
  console.log("✅ Conectado al WebSocket");

  // Autenticación obligatoria
  socket.send(JSON.stringify({
    type: "AUTH",
    name: "constanza baeza",         // <- usa tus datos reales
    student_number: "19626460"
  }));

  // Pedir los sitios de lanzamiento
  socket.send(JSON.stringify({ type: "LAUNCHSITES" }));
  console.log("Se envio laucnsites")

  socket.send(JSON.stringify({ type: "SATELLITES" }));
};



socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("📥 Recibido por WebSocket:", data);


  if (data.type === "LAUNCHSITES") {
    console.log("🚀 Sitios de lanzamiento:", data.launchsites);
  }

  if (data.type === "SATELLITES" && Array.isArray(data.satellites)) {
    console.log("🛰️ IDs de satélites:", data.satellites);

    data.satellites.forEach(satellite_id => {
      socket.send(JSON.stringify({
        type: "SATELLITE-STATUS",
        satellite_id: satellite_id
      }));
    });
  }

  if (data.type === "SATELLITE-STATUS" && data.satellite) {
    console.log("SATELLITE-STATUS")
    const sat = data.satellite;
    guardarOActualizarSatelite(sat);
    actualizarGlobo();
  }

  if (data.type === "POSITION_UPDATE") {
    console.log("POSITION UPDATE")
    data.satellites.forEach(update => {
      if (!update.satellite_id ) {
        console.warn("📡 POSITION_UPDATE con datos incompletos:", update);
      }
      guardarOActualizarSatelite(update);
    });
    renderizarTablaInformativa();
    actualizarGlobo();
  }

  if (data.type === "LAUNCH") {
    console.log("🚀 Lanzamiento recibido:", data);

    //Necesito saber los puntos de lanzamiento, si eso no se puede avanzar

    lanzamientosActivos.push({
      satellite_id: data.satellite_id,
      //startLat: launchsite.lat,
      //startLon: launchsite.lon,
      endLat: data.debris_site.lat,
      endLon: data.debris_site.long
    });

    actualizarGlobo();

  }
};
 

function guardarOActualizarSatelite(nuevoSat) {
  const index = satelitesActivos.findIndex(s => s.satellite_id === nuevoSat.satellite_id);

  if (index !== -1) {
    satelitesActivos[index].position = nuevoSat.position;
    satelitesActivos[index].altitude = nuevoSat.altitude;
    
  } else {
    if (nuevoSat.name && typeof nuevoSat.power === "number") {
      satelitesActivos.push(nuevoSat);
    } else {
      socket.send(JSON.stringify({type: "SATELLITE-STATUS",satellite_id: nuevoSat.satellite_id}))
    }
  }
}


// -----------------------------------------------------------------------------------------------

function actualizarGlobo() {
  const puntos = [
    ...DSN_ANTENNAS,
    ...satelitesActivos.map(sat => ({
      name: sat.name,
      lat: sat.position.lat,
      lon: sat.position.long,
      isSatellite: true
    }))
  ];
  globe
    .pointsData(puntos)
    .pointLat(d => d.lat)
    .pointLng(d => d.lon)
    .pointAltitude(d => d.isSatellite ? 0.2 : 0.01)
    .pointColor(d => d.isSatellite ? "yellow" : "red")
    .pointLabel(d => d.name);

  // globe
  //   .arcsData(lanzamientosActivos)
  //   .arcStartLat(l => l.startLat)
  //   .arcStartLng(l => l.startLon)
  //   .arcEndLat(l => l.endLat)
  //   .arcEndLng(l => l.endLon)
  //   .arcColor(() => ["#ffa500", "#ff4500"])
  //   .arcDashLength(0.4)
  //   .arcDashGap(1)
  //   .arcDashInitialGap(() => Math.random())
  //   .arcDashAnimateTime(4000)
  //   .arcLabel(l => l.satellite_id); // Opcional: tooltip al pasar el mouse
}

//---------------------------------------------------------------------------------------------

function mostrarSatelites() {
  console.log("📦 Lista completa de satélites activos:");
  console.table(satelitesActivos.map(s => ({
    id: s.satellite_id,
    nombre: s.name,
    lat: s.position?.lat,
    lon: s.position?.long,
    potencia: s.power,
    altitud: s.altitude
  })));
}


//---------------------------------------------------------------------------------------------

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function mostrarCoberturaAntena(antena) {
  console.log(antena)
  const { lat, lon, name } = antena;
  console.log(lat)
  console.log(lon)
  console.log(name)
  let totalSenal = 0;
  const satelitesCercanos = [];


  satelitesActivos.forEach(sat => {
    console.log(sat)
    const latsat = sat.position.lat
    const lonsat = sat.position.long
    const lat1Norm = normalizeLatitude(lat);
    const lon1Norm = normalizeLongitude(lon);
    const lat2Norm = normalizeLatitude(latsat);
    const lon2Norm = normalizeLongitude(lonsat);

    const dist = calcularDistanciaKm(lat1Norm, lon1Norm, lat2Norm, lon2Norm);

    //const dist = calcularDistanciaKm(lat, lon, sat.position.lat, sat.position.long);
    console.log(`📏 ${sat.name}: distancia = ${dist.toFixed(2)} km, potencia = ${sat.power}`);
    if (dist <= sat.power) {
      const senal = Math.max(0, 1 - dist / sat.power);
      totalSenal += senal;
      satelitesCercanos.push({
        nombre: sat.name,
        senal: (senal * 100).toFixed(1) + "%"
      });
    }
  });

  const mensaje = `
📡 Antena: ${name}
📍 Posición: (${lat.toFixed(2)}, ${lon.toFixed(2)})

🛰️ Satélites cercanos: ${satelitesCercanos.length}
${satelitesCercanos.map(s => `• ${s.nombre}: ${s.senal}`).join("\n")}

🔋 Señal total recibida: ${(totalSenal * 100).toFixed(1)}%
  `;

  alert(mensaje);
}

function normalizeLatitude(lat) {
  lat = ((lat + 90) % 360 + 360) % 360 - 90;
  return lat;
}

function normalizeLongitude(lon) {
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return lon;
}

function mostrarDetalleSatelite(info) {
  const satelite = satelitesActivos.find(s => s.name === info.name);
  console.log(satelite)

  const org = satelite.organization ?? {};
  const pais = org.country?.name ?? "—";
  const codigo = org.country?.country_code?.toUpperCase();
  const bandera = (codigo && codigo !== "XX")
    ? `https://flagsapi.com/${codigo}/flat/16.png`
    : null;

  const texto = `
    🛰️ ${satelite.name}

    ID: ${satelite.satellite_id}
    Organización: ${org.name ?? "—"}
    País: ${pais}
    Misión: ${satelite.mission ?? "—"}
    Tipo: ${satelite.type ?? "—"}
    Lanzamiento: ${satelite.launch_date ?? "—"}
    Potencia: ${satelite.power ?? "—"}
    Altitud: ${satelite.altitude ?? "—"}
    Vida útil: ${satelite.lifetime ?? "—"} días
    `;

  alert(texto);

}

//-----------------------------------------------------------------------------------------------------------
function renderizarTablaInformativa() {
  const cuerpo = document.querySelector("#tablaSatelites tbody");

  // Mostrar todos los satélites tal cual están en satelitesActivos
  satelitesActivos.forEach(sat => {
    const fila = document.createElement("tr");


    fila.innerHTML = `
      <td>${sat.satellite_id ?? "—"}</td>
      <td>${obtenerBanderaYOrg(sat.organization)}</td>
      <td>${sat.name ?? "—"}</td>
      <td>${sat.mission ?? "—"}</td>
      <td>${sat.launch_date ?? "—"}</td>
      <td>${sat.type ?? "—"}</td>
      <td>${sat.power ?? "—"}</td>
      <td>${sat.altitude ?? "—"}</td>
      <td>${sat.lifespan ?? "—"}</td>
    `;

    cuerpo.appendChild(fila);
  });

  console.log("🛰️ Satélites mostrados en tabla:", satelitesActivos.length);
}

function obtenerBanderaYOrg(organization) {
  if (!organization || !organization.country || !organization.country.country_code) {
    return organization?.name ?? "—";
  }

  const codigo = organization.country.country_code.toUpperCase();
  const nombreOrg = organization.name ?? "";
  const nombrePais = organization.country.name ?? "";

  // Usamos FlagsAPI
  const banderaUrl = `https://flagsapi.com/${codigo}/flat/16.png`;

  return `
    <img src="${banderaUrl}" alt="${codigo}" style="vertical-align: middle; margin-right: 5px;" />
    ${nombreOrg}
  `;
}




