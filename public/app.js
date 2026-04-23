const state = {
  drivers: [],
  currentRide: null,
};

const driverForm = document.querySelector('#driverForm');
const rideForm = document.querySelector('#rideForm');
const driversList = document.querySelector('#driversList');
const driverCount = document.querySelector('#driverCount');
const matchCard = document.querySelector('#matchCard');
const rideStatus = document.querySelector('#rideStatus');
const activityLog = document.querySelector('#activityLog');
const healthStatus = document.querySelector('#healthStatus');

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function log(title, payload) {
  activityLog.textContent = `${title}\n${JSON.stringify(payload, null, 2)}`;
}

function renderDrivers() {
  driverCount.textContent = `${state.drivers.length} added from this screen`;
  driversList.innerHTML =
    state.drivers
      .map(
        (driver) => `
          <article class="item">
            <div class="item-title">
              <span>${driver.name}</span>
              <span>${driver.status}</span>
            </div>
            <div class="meta">
              ${driver.latitude}, ${driver.longitude}<br />
              ${driver.id}
            </div>
          </article>
        `,
      )
      .join('') || '<p class="empty">No drivers added yet.</p>';
}

function renderMatch() {
  if (!state.currentRide) {
    rideStatus.textContent = 'No active ride';
    matchCard.innerHTML = '<p class="empty">Create at least three available drivers, then request a ride.</p>';
    return;
  }

  const { ride, notifiedDrivers } = state.currentRide;
  rideStatus.textContent = `${ride.status} | ${ride.id}`;

  matchCard.innerHTML =
    notifiedDrivers
      .map(
        (candidate, index) => `
          <article class="item">
            <div class="item-title">
              <span>${candidate.driverName || `Driver ${index + 1}`}</span>
              <span>${candidate.distanceKm.toFixed(3)} km</span>
            </div>
            <div class="meta">
              #${index + 1} nearest driver<br />
              ${candidate.latitude ?? ''}, ${candidate.longitude ?? ''}<br />
              ${candidate.driverId}
            </div>
            <button class="secondary" data-driver-id="${candidate.driverId}">Accept Ride</button>
          </article>
        `,
      )
      .join('') || '<p class="empty">No available drivers found within the search radius.</p>';
}

async function checkHealth() {
  try {
    await api('/health');
    healthStatus.textContent = 'API online';
  } catch (error) {
    healthStatus.textContent = 'API offline';
    log('Health check failed', { message: error.message });
  }
}

driverForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = formToObject(driverForm);
  const payload = {
    name: value.name,
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
    status: value.status,
  };

  try {
    const driver = await api('/drivers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.drivers.unshift(driver);
    renderDrivers();
    log('Driver created', driver);
  } catch (error) {
    log('Driver creation failed', { message: error.message });
  }
});

rideForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = formToObject(rideForm);
  const payload = {
    riderId: value.riderId,
    pickupLatitude: Number(value.pickupLatitude),
    pickupLongitude: Number(value.pickupLongitude),
  };

  try {
    state.currentRide = await api('/rides', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    renderMatch();
    log('Ride requested', state.currentRide);
  } catch (error) {
    log('Ride request failed', { message: error.message });
  }
});

matchCard.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-driver-id]');
  if (!button || !state.currentRide) {
    return;
  }

  try {
    const assignedRide = await api(`/rides/${state.currentRide.ride.id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ driverId: button.dataset.driverId }),
    });
    state.currentRide.ride = assignedRide;
    renderMatch();
    log('Ride assigned', assignedRide);
  } catch (error) {
    log('Accept failed', { message: error.message });
  }
});

renderDrivers();
renderMatch();
void checkHealth();
