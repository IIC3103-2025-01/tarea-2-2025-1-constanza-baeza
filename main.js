
const socket = new WebSocket("wss://tarea-2.2025-1.tallerdeintegracion.cl/connect");
let lanzamientosActivos = [];
let puntosdelanzamiento = [];


let satelitesActivos = [];
let zonasCobertura = [];
let mostrarCobertura = false;
let globe;
let usuarioFiltrando = false;
let timeoutFiltro = null;
const eventosRecibidos = new Set();
let etiquetasTemporales = [];




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
      if (info.isSatellite) {
        mostrarDetalleSatelite(info);
      } else if (info.isLaunchsite) {
        mostrarDetalleLaunchsite(info);
      } else if (!info.isSatellite) {
        mostrarCoberturaAntena(info);
      }
    });

    globe.onParticleClick((sat, event, coords) => {
      mostrarDetalleSatelite(sat); // Usando la misma función que tenías antes
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
      const panel = document.getElementById("panelEventos");
      const lista = document.getElementById("listaEventos");
    
      // Mostrar u ocultar
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    
      // Actualizar lista de eventos
      lista.innerHTML = "";
      [...eventosRecibidos].sort().forEach(tipo => {
        const li = document.createElement("li");
        li.textContent = tipo;
        lista.appendChild(li);
      });
    });

    document.getElementById("countryFilter").addEventListener("change", (e) => {
      filtroPaisActual = e.target.value;
      usuarioFiltrando = true;
      reiniciarFiltro();
      renderizarTablaInformativa();
    });
    
    document.getElementById("missionFilter").addEventListener("input", (e) => {
      filtroMisionActual = e.target.value.trim().toLowerCase();
      usuarioFiltrando = true;
      reiniciarFiltro();
      renderizarTablaInformativa();
    });

    document.getElementById("enviarBtn").addEventListener("click", () => {
      const input = document.getElementById("inputMensaje");
      const mensajeTexto = input.value.trim();
      if (mensajeTexto === "") return;
    
      const mensaje = {
        type: "COMM",
        message: mensajeTexto
      };
    
      socket.send(JSON.stringify(mensaje));
    
      // Simula mensaje local saliente en el chat
      mostrarMensajeEnChat({
        station_id: "tú",
        name: "tú",
        level: "info",
        date: new Date().toISOString(),
        content: mensajeTexto
      }, true);
    
      input.value = "";
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

let yaPobléSelect = false;
let filtroPaisActual = "Todos";
let filtroMisionActual = "";

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  //console.log("📥 Recibido por WebSocket:", data);


  if (data.type === "LAUNCHSITES") {
    //console.log("🚀 Sitios de lanzamiento:", data.launchsites);
    data.launchsites.forEach(site => {
      puntosdelanzamiento.push({
        name: site.name,
        lat: site.location.lat,
        lon: site.location.long,
        isLaunchsite: true,
        country: site.country,
        operators: site.operators,
        station_id: site.station_id,
        content: site.content,
        prefix: site.prefix,
        weight: site.weight
    });
      
    });
  
    actualizarGlobo();
  }

  if (data.type === "SATELLITES" && Array.isArray(data.satellites)) {
    //console.log("🛰️ IDs de satélites:", data.satellites);

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
    actualizarGlobo();
    if (!usuarioFiltrando) {
      renderizarTablaInformativa();
    }
  }

  if (data.type === "LAUNCH") {
    //console.log("🚀 Lanzamiento recibido:", data);
    eventosRecibidos.add(data.type);


    let sitio = null;
    for (const punto of puntosdelanzamiento) {
      //console.log(punto)
      if (punto.station_id === data.launchsite_id) {
        sitio = punto;
        break; 
      }
    }

    lanzamientosActivos.push({
      satellite_id: data.satellite_id,
      startLat: sitio.lat,
      startLng: sitio.lon,
      endLat: data.debris_site.lat,
      endLng: data.debris_site.long,
    });

    actualizarGlobo();

  }

  if (data.type === "IN-ORBIT"){
    lanzamientosActivos = lanzamientosActivos.filter(arco => arco.satellite_id !== data.satellite_id);
    actualizarGlobo();
    eventosRecibidos.add(data.type);

  } 

  if (data.type === "CATASTROPHIC-FAILURE"){
    console.log("CATASTROPHIC-FAILURE")
    console.log(data)
    eventosRecibidos.add(data.type);
    const sat = satelitesActivos.find(s => s.satellite_id === data.satellite_id);

    //if (!sat || !sat.position) return;
  
    const etiqueta = {
      lat: sat.position.lat,
      lng: sat.position.long,
      text: `CATASTROPHIC-FAILURE`,
      size: 2,
      color: "red"
    };
  
    etiquetasTemporales.push(etiqueta);
    actualizarGlobo();
  
    // Eliminar después de 20 segundos
    setTimeout(() => {
      etiquetasTemporales = etiquetasTemporales.filter(e => e !== etiqueta);
      actualizarGlobo();
    }, 20000);

  }

  if (data.type === "DEORBITING"){
    console.log("DEORBITING")
    eventosRecibidos.add(data.type);

    //console.log(data)
  }

  if (data.type === "POWER-DOWN"){
    console.log("POWER-DOWN")
    eventosRecibidos.add(data.type);

    //console.log(data)
    const { satellite_id, amount } = data;
    const sat = satelitesActivos.find(s => s.satellite_id === satellite_id);
    //console.log(sat)
    sat.power = sat.power - amount;
    sat.power = Math.max(0, sat.power);

  }

  if (data.type === "POWER-UP"){
    console.log("POWER-UP")
    eventosRecibidos.add(data.type);

    //console.log(data)
    const { satellite_id, amount } = data;
    const sat = satelitesActivos.find(s => s.satellite_id === satellite_id);
    //console.log(sat)
    sat.power = sat.power + amount; 
  }

  if (data.type === "REQUEST"){
    console.log("REQUEST")
    eventosRecibidos.add(data.type);
    //console.log(data)
  }

  if (data.type === "COMM"){
    //console.log("COMM")
    //console.log(data)
    eventosRecibidos.add(data.type);


    const esEasterEgg = data.easter_egg ?? data; // Algunos mensajes vienen anidados, otros no
    let fecha, emisor, contenido, nivel;


    if (!esEasterEgg){
      //console.log("Station id")
      fecha = data.date
      emisor = data.station_id
      contenido = data.message
      nivel = "info"
    } else {
      //console.log("satellite id")
      //console.log(data.satellite_id)
      fecha = data.date ?? new Date().toISOString();
      emisor = data.satellite_id
      contenido = data.message
      nivel = data.level
    }

    mostrarMensajeEnChat({
      name: emisor,
      level: nivel,
      date: fecha,
      content: contenido,
    }, false);
  
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
    ...puntosdelanzamiento.map(site => ({
      ...site,
      isLaunchsite: true
    })),
    ...etiquetasTemporales
  ];

  const gruposParticulas = satelitesActivos.map(sat => [{
    name: sat.name,
    lat: sat.position.lat,
    lng: sat.position.long,
    altitude: sat.altitude
  }]);



  globe
    .pointsData(puntos)
    .pointLat(d => d.lat)
    .pointLng(d => d.lon)
    .pointAltitude(0.01)
    .pointColor(d =>
      d.isLaunchsite ? "blue" : "red"
    )
    .pointLabel(d => d.name);

  globe
    .particlesData(gruposParticulas)
    .particlesList(d => d) // cada grupo tiene un solo punto
    .particleLat(d => d.lat)
    .particleLng(d => d.lng)
    .particleAltitude(d => d.altitude)
    .particlesSize(1)



  if (mostrarCobertura) {
    globe.labelsData([
      ...generarZonasCobertura(),   // etiquetas de cobertura normales
      ...etiquetasTemporales        // etiquetas de CATASTROPHIC-FAILURE
    ])
    .labelLat(d => d.lat)
    .labelLng(d => d.lng)
    .labelColor(d => d.color || "rgba(255, 255, 0, 0.2)")
    .labelDotRadius(d => d.size || 0.5)
    .labelText(d => d.text);
  } else {
    globe.labelsData(etiquetasTemporales)
      .labelLat(d => d.lat)
      .labelLng(d => d.lng)
      .labelColor(d => d.color || "red")
      .labelDotRadius(d => d.size || 1.5)
      .labelText(d => d.text);
  }



  const satIDsActivos = satelitesActivos.map(s => s.satellite_id);


  const arcosVisibles = lanzamientosActivos.filter(arco =>
    !satIDsActivos.includes(arco.satellite_id)
  );


  globe
    .arcsData(arcosVisibles)
    .arcColor(() => ["#ffa500", "#ff4500"])
    .arcStroke(()=>1.2)

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
  cuerpo.innerHTML = ""; // Limpia la tabla

  let satelitesFiltrados = [...satelitesActivos];

  // Filtro por país
  if (filtroPaisActual !== "Todos") {
    satelitesFiltrados = satelitesFiltrados.filter(sat =>
      sat.organization?.country?.country_code === filtroPaisActual
    );
  }

  // Filtro por misión
  if (filtroMisionActual !== "") {
    satelitesFiltrados = satelitesFiltrados.filter(sat =>
      sat.mission?.toLowerCase().includes(filtroMisionActual)
    );
  }

  // Ordenar por altitud descendente
  const satelitesOrdenados = satelitesFiltrados.sort((a, b) =>
    (b.altitude ?? 0) - (a.altitude ?? 0)
  );

  // Renderizar
  satelitesOrdenados.forEach(sat => {
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

}

function obtenerBanderaYOrg(organization) {
  if (!organization || !organization.country || !organization.country.country_code) {
    return organization?.name ?? "—";
  }

  const codigo = organization.country.country_code.toUpperCase();
  const nombreOrg = organization.name ?? "";
  const nombrePais = organization.country.name ?? "";

  const codigosInvalidos = ["XX", "EU", "--"];

  if (codigosInvalidos.includes(codigo)) {
    return `${nombreOrg}`;
  }


  // Usamos FlagsAPI
  const banderaUrl = `https://flagsapi.com/${codigo}/flat/16.png`;

  return `
    <img src="${banderaUrl}" alt="${codigo}" style="vertical-align: middle; margin-right: 5px;" />
    ${nombreOrg}
  `;
}

function reiniciarFiltro() {
  clearTimeout(timeoutFiltro);
  timeoutFiltro = setTimeout(() => {
    usuarioFiltrando = false;
  }, 3000); // 3 segundos sin actividad = consideramos que ya no está filtrando
}

//-----------------------------------------------------------------------------------------------------------

function mostrarDetalleLaunchsite(site) {
  const codigo = site.country?.country_code?.toUpperCase();
  const bandera = (codigo && codigo !== "XX")
    ? `https://flagsapi.com/${codigo}/flat/24.png`
    : null;

  const info = `
🚀 ${site.name}
ID: ${site.station_id}
País:${site.country?.name ?? "—"}
Operadores:${site.operators?.join(", ") ?? "—"}
Uso: ${site.content ?? "—"}
Ubicación: (${site.lat.toFixed(2)}, ${site.lon.toFixed(2)})
  `;

  alert(info);
}

function mostrarDetalleSatelite(info) {
  const satelite = satelitesActivos.find(s => s.name === info.name);

  if (!satelite) {
    console.warn("Satélite no encontrado:", info.name);
    return;
  }

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

function kmToDegrees(km) {
  const earthRadiusKm = 6371; // Radio terrestre
  return (km / earthRadiusKm) * (180 / Math.PI);
}

function generarZonasCobertura() {
  const satelitesCobertura = [];

  for (const sat of satelitesActivos) {
    if (
      sat.status === "in-orbit" &&
      sat.position &&
      typeof sat.position.lat === "number" &&
      typeof sat.position.long === "number" &&
      typeof sat.power === "number"
    ) {
      satelitesCobertura.push({
        lat: sat.position.lat,
        lng: sat.position.long,
        text: sat.name,
        size: kmToDegrees(sat.power), // Tamaño en grados
        altitude: sat.altitude,
        isCoverage: true
      });
    }
  }

  return satelitesCobertura;
}

//-----------------------------------------------------------------------------------------------------------


function mostrarMensajeEnChat(msg, esSaliente = false) {
  const contenedor = document.getElementById("output");

  const div = document.createElement("div");
  div.style.marginBottom = "0.5rem";
  div.style.padding = "0.4rem";
  div.style.borderRadius = "6px";
  div.style.background = esSaliente ? "#e6f7ff" : "#f2f2f2";
  div.style.color = msg.level === "warn" ? "red" : "black";

  const fecha = new Date(msg.date).toLocaleString("es-CL");

  // Puedes agregar ícono si es easter egg
  const icono = msg.easter ? "🛰️ " : "";

  div.innerHTML = `
    <strong>${icono}${msg.name}:</strong> ${msg.content}<br />
    <small>${fecha}</small>
  `;

  contenedor.appendChild(div);
  contenedor.scrollTop = contenedor.scrollHeight;
}

