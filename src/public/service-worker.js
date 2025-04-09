

let currentLatitude = null;
let currentLongitude = null;

// Escuchar mensajes del hilo principal (Frontend)
self.addEventListener('message', event => {
    if (event.data && event.data.latitude && event.data.longitude) {
        currentLatitude = event.data.latitude;
        currentLongitude = event.data.longitude;
        console.log('Ubicación recibida del frontend:', currentLatitude, currentLongitude);
    }
});

// Sincronizar ubicación cuando se recibe el evento 'sync'
self.addEventListener('sync', event => {
    if (event.tag === 'location-sync') {
        console.log('Intentando sincronizar ubicación...');
        event.waitUntil(syncLocationData());
    }
});

// Función para sincronizar la ubicación con el servidor
function syncLocationData() {
    if (currentLatitude && currentLongitude) {
        console.log('Sincronizando ubicación con el servidor:', currentLatitude, currentLongitude);
        return fetch('/update-location', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                latitude: currentLatitude,
                longitude: currentLongitude
            })
        }).then(response => {
            console.log('Respuesta del servidor:', response.status, response.statusText);
            if (!response.ok) {
                console.error('Error al sincronizar la ubicación. Estado:', response.status);
            } else {
                console.log('Ubicación sincronizada correctamente');
            }
        }).catch(error => {
            console.error('Error de red:', error);
        });
    } else {
        console.error('No hay datos de ubicación disponibles');
    }
}

// Esta es una función extra en caso de que desees manejar la notificación push
self.addEventListener('push', event => {
    const data = event.data.json(); // Los datos enviados con la notificación
    self.registration.showNotification(data.title, {
        body: data.message,
        icon: '/imagenes/apk192.png'
    });
});