/**
 * Sons United Directory Map
 * A map-based directory for organization members
 */

// ============ CONFIGURATION & CONSTANTS ============

// API tokens & configuration
mapboxgl.accessToken = 'pk.eyJ1IjoianVzdGluc2luY2xhaXJjcmVhdGl2ZSIsImEiOiJjbTl2dmJ2Z20wb3M4MnFtdzVqZ3l1YTdtIn0.yRr3osd2oFqcKbjg_3O1Hg';
const SHEET_ID = '1v-IuJlxT5PFTEsTopN53KgqWilZ1x6maVZv_k64CMF0';
const GOOGLE_API_KEY = 'AIzaSyDxkaHehVwvFf6s7f5Y-UtgsefOp6EZtgI';
const DEFAULT_CENTER = [-97.695029, 37.443203];
const DESKTOP_ZOOM = 3.78;
const MOBILE_ZOOM = 2.5; // More zoomed out for mobile
const DEFAULT_VIEW = { center: DEFAULT_CENTER, zoom: DESKTOP_ZOOM, pitch: 0, bearing: 0 };
const MARKER_ICONS = {
  default: 'icons/sons.png',
  hover: 'icons/sonshover.png',
  click: 'icons/sonsclick.png'
};

// State abbreviations to full names mapping
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

// ============ GLOBAL VARIABLES ============

// Application state
let contacts = [];
let clusterIndex;
let markers = {};
let selectedIdx = null;
let searchTimeout;

// DOM elements (cached for performance)
const spinner = document.getElementById('spinner');
const basicInfo = document.getElementById('basic-info');
const extraDetails = document.getElementById('extra-details');
const sortSelect = document.getElementById('sort-select');
const contactList = document.getElementById('contact-list');
const searchInput = document.getElementById('search');
const infoBox = document.getElementById('info-box');
const showAllBtn = document.getElementById('show-all');
const recenterBtn = document.getElementById('recenter');
const downloadBtn = document.getElementById('download');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');

// ============ INITIALIZATION ============

// Initialize map with default settings
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/justinsinclaircreative/cma43snlr002t01sih71s9nng',
  ...getMapView() // Use device-appropriate view
});

// Set up error tracking
console.log("Script started");
window.onerror = function(msg, url, line) {
  console.error(`Error: ${msg} at ${url}:${line}`);
  return false;
};

// Load map and initialize app
map.on('load', () => {
  console.log("Map loaded, setting up markers...");
  
  // Load all marker icons first
  Promise.all([
    new Promise((r, j) => map.loadImage(MARKER_ICONS.default, (e, i) => e ? j(e) : r(['default', i]))),
    new Promise((r, j) => map.loadImage(MARKER_ICONS.hover, (e, i) => e ? j(e) : r(['hover', i]))),
    new Promise((r, j) => map.loadImage(MARKER_ICONS.click, (e, i) => e ? j(e) : r(['click', i]))),
  ]).then(imgs => {
    console.log("All marker images loaded");
    imgs.forEach(([n, i]) => map.addImage(n, i));
    
    // Fetch data from Google Sheets
    fetchData();
  }).catch(error => {
    console.error("Error loading marker images:", error);
  });
});

// Setup event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupEnhancedSearch();
});

// Initialize map controls
function setupEventListeners() {
  // Map controls
  zoomInBtn.onclick = () => map.zoomIn();
  zoomOutBtn.onclick = () => map.zoomOut();
  recenterBtn.onclick = resetEverything;
  showAllBtn.onclick = resetEverything;
  
  // Directory controls
  sortSelect.onchange = () => reorderList(contacts);
  downloadBtn.onclick = downloadCSV;
  
  // Search events
  searchInput.addEventListener('input', handleSearchInput);
  searchInput.addEventListener('change', handleSearchSelection);
  
  // Map events
  map.on('moveend', () => {
    updateClusters();
    reorderList(contacts);
  });
  
  // Click outside to deselect
  document.body.addEventListener('click', handleOutsideClick);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    handleMobileTitle();
    setupEnhancedSearch();
  });
  
  // Initialize mobile view adjustments
  handleMobileTitle();
}

// ============ DATA MANAGEMENT ============

// Fetch data from Google Sheets
function fetchData() {
  spinner.style.display = 'block';
  basicInfo.textContent = 'Loading contacts…';
  
  gapi.load('client', () => {
    gapi.client.init({
      apiKey: GOOGLE_API_KEY,
      discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
    }).then(() => {
      return gapi.client.sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    }).then(meta => {
      const name = meta.result.sheets[0].properties.title;
      return gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${name}!A2:I`
      });
    }).then(res => {
      // Process the data
      const rows = res.result.values || [];
      contacts = rows.map(r => ({
        email: r[0] || '', 
        fullName: r[1] || '', 
        phone: r[2] || '',
        zip: r[3] || '', 
        city: r[4] || '', 
        state: r[5] || '',
        career: r[6] || '', 
        strengths: r[7] || '', 
        notes: r[8] || '',
        address: '',
        coords: null
      }));
      
      // Calculate address for each contact
      contacts.forEach(c => c.address = [c.city, c.state, c.zip].filter(Boolean).join(', '));
      
      // Update UI
      basicInfo.textContent = `${contacts.length} members:`;
      
      // Get geocoding data
      geocodeAll();
    }).catch(err => {
      console.error('Sheet load error', err);
      basicInfo.innerHTML = `<em>Error: ${err.message}</em>`;
      spinner.style.display = 'none';
    });
  });
}

// Geocode all contacts
async function geocodeAll() {
  console.log("Starting geocoding for", contacts.length, "contacts");
  let geocodeSuccessCount = 0;
  
  // Process contacts in smaller batches to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (r, batchIndex) => {
      const index = i + batchIndex;
      
      // Skip if no location data
      if (!r.city && !r.state && !r.zip) {
        console.warn(`Contact ${index}: Missing location data, skipping geocoding`);
        return;
      }
      
      // Create geocode string
      const geocodeString = [r.city, r.state, r.zip].filter(Boolean).join(', ');
      console.log(`Contact ${index}: Geocoding "${geocodeString}"`);
      const cacheKey = `geo_${geocodeString}`;
      
      // Try to get from cache first
      const cachedCoords = localStorage.getItem(cacheKey);
      if (cachedCoords) {
        try {
          r.coords = JSON.parse(cachedCoords);
          geocodeSuccessCount++;
          console.log(`Contact ${index}: Using cached coordinates [${r.coords[0]}, ${r.coords[1]}]`);
          return;
        } catch (e) {
          console.warn(`Contact ${index}: Invalid cached coordinates, will re-geocode`);
          localStorage.removeItem(cacheKey);
        }
      }
      
      // Need to geocode
      try {
        console.log(`Contact ${index}: Fetching coordinates for "${geocodeString}"`);
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(geocodeString)}.json?access_token=${mapboxgl.accessToken}`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          r.coords = data.features[0].geometry.coordinates;
          localStorage.setItem(cacheKey, JSON.stringify(r.coords));
          geocodeSuccessCount++;
          console.log(`Contact ${index}: Geocoded to [${r.coords[0]}, ${r.coords[1]}]`);
        } else {
          console.warn(`Contact ${index}: No features found for "${geocodeString}"`);
          r.coords = [0, 0];
        }
      } catch (error) {
        console.error(`Contact ${index}: Error geocoding "${geocodeString}":`, error);
        r.coords = [0, 0];
      }
    }));
    
    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < contacts.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`Geocoding completed: ${geocodeSuccessCount}/${contacts.length} successful`);
  
  // Hide spinner and initialize map
  spinner.style.display = 'none';
  
  // Initialize map with contacts
  buildClusterIndex();
  sortSelect.value = 'state'; // Default sort
  initList();
  updateSearchSuggestions();
}

// Build the cluster index for map points
function buildClusterIndex() {
  console.log("Building cluster index with contacts:", contacts.length);
  
  // Filter out contacts without valid coordinates
  const validContacts = contacts.filter(r => r.coords && Array.isArray(r.coords) && 
                                            r.coords.length === 2 && 
                                            (r.coords[0] !== 0 || r.coords[1] !== 0));
  
  console.log(`Valid contacts for clustering: ${validContacts.length}`);
  
  // Create features for the cluster index
  const features = validContacts.map((r) => ({
    type: 'Feature',
    id: contacts.indexOf(r),
    geometry: { type: 'Point', coordinates: r.coords },
    properties: {}
  }));
  
  console.log(`Created ${features.length} features for clustering`);
  
  // Initialize cluster index
  clusterIndex = new Supercluster({ radius: 60, maxZoom: 16 });
  clusterIndex.load(features);
  
  // Update clusters initially
  updateClusters();
}

// ============ MAP FUNCTIONS ============

// Update markers based on current map view
function updateClusters() {
  try {
    console.log("Updating clusters...");
    const bbox = map.getBounds().toArray().flat();
    const zoom = Math.floor(map.getZoom());
    console.log(`Current map view: zoom ${zoom}, bounds ${bbox}`);

    // Get clusters for current view
    const clusters = clusterIndex.getClusters(bbox, zoom);
    console.log(`Found ${clusters.length} clusters/points in current view`);

    // Track which markers should be visible
    const visibleMarkers = new Set();
    clusters.forEach(c => {
      visibleMarkers.add(c.properties.cluster
        ? `c_${c.properties.cluster_id}`
        : `p_${c.id}`);
    });

    // Hide or show existing markers
    Object.keys(markers).forEach(key => {
      const element = markers[key].getElement();
      element.style.visibility = visibleMarkers.has(key) ? 'visible' : 'hidden';
    });

    // Create or update markers
    clusters.forEach(cluster => {
      if (cluster.properties.cluster) {
        // This is a cluster marker
        updateClusterMarker(cluster);
      } else {
        // This is an individual pin
        updatePinMarker(cluster);
      }
    });

    console.log("Clusters update completed");
  } catch (err) {
    console.error("Error in updateClusters:", err);
  }
}

// Create or update a cluster marker
function updateClusterMarker(cluster) {
  const clusterId = cluster.properties.cluster_id;
  const key = `c_${clusterId}`;
  const [lng, lat] = cluster.geometry.coordinates;
  
  if (!markers[key]) {
    // Create new cluster marker
    const pointCount = cluster.properties.point_count_abbreviated;
    const element = document.createElement('div');
    element.className = 'cluster-marker pop-in';
    element.textContent = pointCount;
    
    // Size based on point count
    const size = 20 + pointCount * 5;
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
    
    // Add click handler to zoom in
    element.onclick = () => {
      const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: [lng, lat], zoom: expansionZoom, speed: 2 });
    };
    
    // Remove pop-in animation when done
    element.addEventListener('animationend', () => element.classList.remove('pop-in'));
    
    // Create marker
    markers[key] = new mapboxgl.Marker(element)
      .setLngLat([lng, lat])
      .addTo(map);
    
    console.log(`Created cluster marker at [${lng}, ${lat}] with ${pointCount} points`);
  } else {
    // Update existing marker position
    markers[key].setLngLat(cluster.geometry.coordinates);
  }
}

// Create or update an individual pin marker
function updatePinMarker(point) {
  const contactId = point.id;
  const key = `p_${contactId}`;
  const [lng, lat] = point.geometry.coordinates;
  
  if (!markers[key]) {
    // Create new pin marker
    const img = document.createElement('img');
    img.className = 'marker-icon pop-in';
    img.src = MARKER_ICONS.default;
    
    // Hover state
    img.addEventListener('mouseenter', () => img.src = MARKER_ICONS.hover);
    img.addEventListener('mouseleave', () => {
      img.src = (contactId === selectedIdx ? MARKER_ICONS.click : MARKER_ICONS.default);
    });
    
    // Click handler
    img.addEventListener('click', () => onContactClick(contactId));
    
    // Animation cleanup
    img.addEventListener('animationend', () => img.classList.remove('pop-in'));
    
    // Create marker
    markers[key] = new mapboxgl.Marker(img)
      .setLngLat([lng, lat])
      .addTo(map);
    
    console.log(`Created pin marker at [${lng}, ${lat}] for contact #${contactId}`);
  } else {
    // Update existing marker position
    markers[key].setLngLat([lng, lat]);
  }
}

// ============ DIRECTORY FUNCTIONS ============

// Initialize contact list
function initList() {
  reorderList(contacts);
  contactList.scrollTop = 0;
}

// Get contacts visible in current map view
function getContactsInView() {
  if (!contacts.length) return [];
  
  const bounds = map.getBounds();
  return contacts
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => {
      if (!r.coords) return false;
      const [lng, lat] = r.coords;
      return bounds.contains([lng, lat]);
    })
    .map(({ i }) => i);
}

// Reorder the contact list based on sort option
function reorderList(list) {
  contactList.innerHTML = '';
  const sortCriterion = sortSelect.value;
  const inViewIndices = new Set(getContactsInView());
  const activeIndex = selectedIdx;

  // Create list item for a contact
  function createListItem(contact, index) {
    const li = document.createElement('li');
    li.textContent = contact.fullName;
    li.tabIndex = 0;
    
    if (index === activeIndex) {
      li.classList.add('active-contact');
    } else if (inViewIndices.has(index)) {
      li.classList.add('in-view');
    }
    
    // Handle click on contact
    li.onclick = (e) => {
      e.stopPropagation();
      
      if (contact.coords) {
        const zoom = map.getZoom();
        const clusters = clusterIndex.getClusters(map.getBounds().toArray().flat(), Math.floor(zoom));
        
        // Check if contact is inside a cluster
        let containingCluster = null;
        for (const c of clusters) {
          if (c.properties && c.properties.cluster) {
            const leaves = clusterIndex.getLeaves(c.properties.cluster_id, Infinity);
            if (leaves.some(leaf => leaf.id === index)) {
              containingCluster = c;
              break;
            }
          }
        }
        
        if (containingCluster) {
          // Expand cluster first, then zoom to contact
          const clusterId = containingCluster.properties.cluster_id;
          const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
          
          map.easeTo({ 
            center: contact.coords, 
            zoom: expansionZoom, 
            speed: 2 
          });
          
          setTimeout(() => {
            map.flyTo({ 
              center: contact.coords, 
              zoom: Math.max(expansionZoom, 8), 
              speed: 2 
            });
            onContactClick(index);
          }, 600);
        } else {
          // Zoom directly to contact
          map.flyTo({ 
            center: contact.coords, 
            zoom: Math.max(zoom, 8), 
            speed: 2 
          });
          onContactClick(index);
        }
      } else {
        // No coordinates, just select the contact
        onContactClick(index);
      }
    };
    
    return li;
  }

  // Sort contacts based on selected criterion
  let sorted = [...list];
  sorted.sort((a, b) => {
    switch (sortCriterion) {
      case 'first':
        return a.fullName.localeCompare(b.fullName);
      
      case 'last':
        const lastNameA = a.fullName.split(' ').slice(-1)[0];
        const lastNameB = b.fullName.split(' ').slice(-1)[0];
        return lastNameA.localeCompare(lastNameB);
      
      case 'state':
        const stateA = (a.state || '').toUpperCase();
        const stateB = (b.state || '').toUpperCase();
        return stateA.localeCompare(stateB) || a.fullName.localeCompare(b.fullName);
      
      case 'career':
        return (a.career || '').localeCompare(b.career || '') || 
               a.fullName.localeCompare(b.fullName);
      
      default:
        return 0;
    }
  });

  // Split contacts into in-view and not-in-view
  const withIndices = sorted.map(contact => ({ 
    contact, 
    index: contacts.indexOf(contact) 
  }));
  
  const inView = withIndices.filter(x => 
    inViewIndices.has(x.index) && x.index !== activeIndex
  );
  
  const notInView = withIndices.filter(x => 
    !inViewIndices.has(x.index) && x.index !== activeIndex
  );

  // Always show active contact at the top
  if (activeIndex !== null && contacts[activeIndex]) {
    contactList.appendChild(createListItem(contacts[activeIndex], activeIndex));
  }

  // Simple sort (no grouping)
  if (sortCriterion === 'first') {
    [...inView, ...notInView].forEach(({ contact, index }) => 
      contactList.appendChild(createListItem(contact, index))
    );
    return;
  }

  // Group contacts by sort criteria
  function groupContacts(contactArray) {
    const groups = {};
    
    contactArray.forEach(({ contact, index }) => {
      let key = '';
      
      switch (sortCriterion) {
        case 'last':
          key = contact.fullName.split(' ').slice(-1)[0][0].toUpperCase();
          break;
        
        case 'state':
          key = (contact.state || '').toUpperCase();
          break;
        
        case 'career':
          key = contact.career || '';
          break;
      }
      
      groups[key] = groups[key] || [];
      groups[key].push({ contact, index });
    });
    
    return groups;
  }

  // Render contact groups with headers
  function renderGroups(groups) {
    Object.keys(groups).sort().forEach(header => {
      // Create group header
      const headerItem = document.createElement('li');
      headerItem.textContent = header;
      headerItem.className = 'list-header';
      contactList.appendChild(headerItem);
      
      // Add contacts in this group
      groups[header].forEach(({ contact, index }) => 
        contactList.appendChild(createListItem(contact, index))
      );
    });
  }

  // Render in-view contacts first, then not-in-view
  renderGroups(groupContacts(inView));
  renderGroups(groupContacts(notInView));
}

// Handle click on a contact marker or list item
function onContactClick(index) {
  // Reset previous selection
  if (selectedIdx !== null) {
    const oldMarker = markers[`p_${selectedIdx}`];
    if (oldMarker) {
      oldMarker.getElement().src = MARKER_ICONS.default;
    }
  }
  
  // Update selection
  selectedIdx = index;
  
  // Update marker style
  const newMarker = markers[`p_${index}`];
  if (newMarker) {
    newMarker.getElement().src = MARKER_ICONS.click;
  }
  
  // Show contact details
  showInfo(index);
  
  // Update list order
  reorderList(contacts);
}

// Show default info (no contact selected)
function showDefaultInfo() {
  basicInfo.innerHTML = `<em>${contacts.length} Sons United members:</em>`;
  extraDetails.innerHTML = '';
  extraDetails.style.display = 'none';
  infoBox.classList.remove('expanded');
}

// Show details for a specific contact
function showInfo(index) {
  const contact = contacts[index];
  const cityStateZip = [contact.city, contact.state, contact.zip].filter(Boolean).join(', ');
  
  // Update basic info section
  basicInfo.innerHTML = `
    <div class="name-row">
      <h3>${contact.fullName}</h3>
      <button id="toggle-details" class="visible">Details</button>
    </div>
    <div class="contact-info">
      <p>${cityStateZip}</p>
      <p>${contact.email}</p>
      <p>${contact.phone}</p>
    </div>`;
  
  // Prepare extra details
  extraDetails.innerHTML = `
    <p><strong>Career/Work:</strong> ${contact.career || 'Not specified'}</p>
    <p><strong>Strengths/Interests:</strong> ${contact.strengths || 'Not specified'}</p>
    <p><strong>Notes:</strong> ${contact.notes || 'None'}</p>`;
  
  // Hide extra details by default
  extraDetails.style.display = 'none';
  infoBox.classList.add('expanded');
  
  // Add toggle handler for details button
  document.getElementById('toggle-details').onclick = toggleExtraDetails;
}

// Toggle extra details visibility
function toggleExtraDetails() {
  if (extraDetails.style.display === 'none' || extraDetails.style.display === '') {
    extraDetails.style.display = 'block';
    this.textContent = 'Hide Details';
  } else {
    extraDetails.style.display = 'none';
    this.textContent = 'Details';
  }
}

// ============ SEARCH FUNCTIONS ============

// Handle search input
function handleSearchInput(e) {
  clearTimeout(searchTimeout);
  
  // Clear everything if search is empty
  if (!e.target.value.trim()) {
    resetEverything();
    return;
  }
  
  // Debounce to prevent excessive processing
  searchTimeout = setTimeout(() => {
    const query = e.target.value.toLowerCase().trim();
    console.log("Searching for:", query);
    
    // Find matching contacts
    const matchingContacts = findMatchingContacts(query);
    console.log(`Found ${matchingContacts.length} matching contacts`);
    
    // Update map with matching contacts
    updateMapWithContacts(matchingContacts);
    
    // Update directory list
    reorderList(matchingContacts);
    
    // Update search suggestions
    updateSearchSuggestions();
  }, 300);
}

// Find contacts matching search query
function findMatchingContacts(query) {
  return contacts.filter(contact => {
    const searchableFields = [
      contact.fullName || '',
      contact.email || '',
      contact.phone || '',
      contact.address || '',
      contact.city || '',
      contact.state || '',
      contact.zip || '',
      contact.career || '',
      contact.strengths || '',
      contact.notes || ''
    ];
    
    // Add full state name if available
    const stateAbbr = (contact.state || '').toUpperCase();
    const stateName = STATE_NAMES[stateAbbr] || '';
    if (stateName) {
      searchableFields.push(stateName);
    }
    
    // Check if any field contains the query
    return searchableFields.some(field => 
      field.toString().toLowerCase().includes(query)
    );
  });
}

// Update map with filtered contacts
function updateMapWithContacts(filteredContacts) {
  if (!clusterIndex) return;
  
  const features = filteredContacts
    .filter(r => r.coords && Array.isArray(r.coords) && r.coords.length === 2)
    .map(r => ({
      type: 'Feature',
      id: contacts.indexOf(r),
      geometry: { type: 'Point', coordinates: r.coords },
      properties: {}
    }));
    
  clusterIndex.load(features);
  updateClusters();
}

// Handle search selection
function handleSearchSelection(e) {
  const value = e.target.value;
  const matchingContact = contacts.find(c => c.fullName === value);
  
  if (matchingContact) {
    const index = contacts.indexOf(matchingContact);
    if (index >= 0) {
      // Fly to the contact on the map
      if (matchingContact.coords) {
        map.flyTo({
          center: matchingContact.coords,
          zoom: Math.max(map.getZoom(), 8),
          speed: 2
        });
        setTimeout(() => {
          onContactClick(index);
        }, 500);
      } else {
        onContactClick(index);
      }
    }
  }
}

// Update search suggestions dropdown
function updateSearchSuggestions() {
  const datalist = document.getElementById('search-suggestions');
  if (!datalist || !searchInput) return;
  
  // Clear previous suggestions
  datalist.innerHTML = '';
  
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return;
  
  // Find matching contacts
  const matchingContacts = [];
  
  contacts.forEach(contact => {
    const searchableFields = [
      contact.fullName || '',
      contact.email || '',
      contact.phone || '',
      contact.address || '',
      contact.city || '',
      contact.state || '',
      contact.zip || '',
      contact.career || '',
      contact.strengths || '',
      contact.notes || ''
    ];
    
    // Add state full name
    const stateAbbr = (contact.state || '').toUpperCase();
    const stateName = STATE_NAMES[stateAbbr] || '';
    if (stateName) {
      searchableFields.push(stateName);
    }
    
    // Check for matches in any field
    const matches = [];
    const fieldNames = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Career', 'Strengths', 'Notes'];
    
    searchableFields.forEach((value, i) => {
      if (value && value.toString().toLowerCase().includes(query)) {
        const field = i < fieldNames.length ? fieldNames[i] : 'Other';
        matches.push({ field: field, label: value });
      }
    });
    
    if (matches.length) {
      const detailText = matches.map(m => `${m.field}: ${m.label}`).join(', ');
      matchingContacts.push({
        value: contact.fullName,
        label: `${contact.fullName} — ${detailText}`,
        index: contacts.indexOf(contact)
      });
    }
  });
  
  // Add suggestions to datalist
  matchingContacts.slice(0, 10).forEach(match => {
    const option = document.createElement('option');
    option.value = match.value;
    option.label = match.label;
    option.dataset.index = match.index;
    datalist.appendChild(option);
  });
  
  // Force browser to refresh suggestions on mobile
  searchInput.setAttribute('list', '');
  setTimeout(() => {
    searchInput.setAttribute('list', 'search-suggestions');
  }, 10);
}

// Update custom suggestions for mobile devices
function updateCustomSuggestions(container, query) {
  container.innerHTML = '';
  if (!query) return;
  
  // Use the same matching logic as search
  const q = query.toLowerCase();
  const matches = [];
  
  contacts.forEach((contact, idx) => {
    const searchableFields = [
      contact.fullName || '',
      contact.email || '',
      contact.phone || '',
      contact.address || '',
      contact.city || '',
      contact.state || '',
      contact.zip || '',
      contact.career || '',
      contact.strengths || '',
      contact.notes || ''
    ];
    
    // Add state full names
    const stateAbbr = (contact.state || '').toUpperCase();
    const stateName = STATE_NAMES[stateAbbr] || '';
    if (stateName) {
      searchableFields.push(stateName);
    }
    
    // Find matches in each field
    let isMatch = false;
    const matchDetails = [];
    
    searchableFields.forEach((value, i) => {
      if (value && value.toString().toLowerCase().includes(q)) {
        isMatch = true;
        const fieldNames = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Career', 'Strengths', 'Notes'];
        const field = i < fieldNames.length ? fieldNames[i] : 'Other';
        matchDetails.push(`${field}: ${value}`);
      }
    });
    
    if (isMatch) {
      matches.push({
        name: contact.fullName,
        details: matchDetails.join(', '),
        index: idx
      });
    }
  });
  
  // Create suggestion items
  matches.slice(0, 10).forEach(match => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.textContent = `${match.name} — ${match.details}`;
    div.dataset.index = match.index;
    
    div.addEventListener('click', function() {
      const index = parseInt(this.dataset.index);
      searchInput.value = contacts[index].fullName;
      container.classList.remove('visible');
      
      // Navigate to contact
      if (contacts[index].coords) {
        map.flyTo({
          center: contacts[index].coords,
          zoom: Math.max(map.getZoom(), 8),
          speed: 2
        });
        setTimeout(() => {
          onContactClick(index);
        }, 500);
      } else {
        onContactClick(index);
      }
    });
    
    container.appendChild(div);
  });
}

// Enhanced mobile-friendly search setup
function setupEnhancedSearch() {
  const isMobile = window.innerWidth <= 900;
  
  // Special handling for mobile browsers with limited datalist support
  if (isMobile && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    console.log("Using enhanced mobile search");
    
    // Create custom suggestions container if needed
    let suggestionsContainer = document.querySelector('.custom-suggestions');
    if (!suggestionsContainer) {
      suggestionsContainer = document.createElement('div');
      suggestionsContainer.className = 'custom-suggestions';
      searchInput.parentNode.appendChild(suggestionsContainer);
      
      // Close suggestions when clicking outside
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.custom-suggestions') && 
            !e.target.closest('#search')) {
          suggestionsContainer.classList.remove('visible');
        }
      });
    }
    
    // Show custom suggestions on focus
    searchInput.addEventListener('focus', function() {
      if (this.value.trim().length > 0) {
        updateCustomSuggestions(suggestionsContainer, this.value.trim());
        suggestionsContainer.classList.add('visible');
      }
    });
    
    // Update suggestions as user types
    searchInput.addEventListener('input', function() {
      if (this.value.trim().length > 0) {
        updateCustomSuggestions(suggestionsContainer, this.value.trim());
        suggestionsContainer.classList.add('visible');
      } else {
        suggestionsContainer.classList.remove('visible');
      }
    });
  }
}

// ============ UTILITY FUNCTIONS ============

// Handle clicks outside of active elements
function handleOutsideClick(e) {
  if (
    !e.target.closest('#contact-list') &&
    !e.target.closest('#info-box') &&
    !e.target.closest('.marker-icon')
  ) {
    // Deselect current contact
    selectedIdx = null;
    
    // Reset info box
    showDefaultInfo();
    
    // Update list
    reorderList(contacts);
    
    // Reset marker icons
    Object.keys(markers).forEach(key => {
      if (key.startsWith('p_')) {
        markers[key].getElement().src = MARKER_ICONS.default;
      }
    });
  }
}

// Download contacts as CSV
function downloadCSV() {
  const header = ['Full Name', 'City', 'State', 'Zip Code', 'Email', 'Phone', 'Career/Work', 'Strengths/Interests', 'Notes'];
  const rows = [
    header, 
    ...contacts.map(r => [
      r.fullName,
      r.city || '',
      r.state || '',
      r.zip || '',
      r.email,
      r.phone,
      r.career,
      r.strengths,
      r.notes
    ])
  ];
  
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = 'contacts.csv';
  link.click();
  
  URL.revokeObjectURL(url);
}

// Reset all filters and return to default view
function resetEverything() {
  console.log("Resetting everything");
  
  // Clear search input
  searchInput.value = '';
  
  // Clear search suggestions
  const suggestions = document.querySelector('.custom-suggestions');
  if (suggestions) suggestions.classList.remove('visible');
  
  // Reset map markers with ALL contacts
  if (clusterIndex && contacts.length > 0) {
    console.log("Rebuilding cluster index with all contacts");
    
    // Only use contacts with valid coordinates
    const features = contacts
      .filter(r => r.coords && Array.isArray(r.coords) && r.coords.length === 2 && 
               (r.coords[0] !== 0 || r.coords[1] !== 0))
      .map(r => ({
        type: 'Feature',
        id: contacts.indexOf(r),
        geometry: { type: 'Point', coordinates: r.coords },
        properties: {}
      }));
    
    clusterIndex.load(features);
    updateClusters();
  }
  
  // Reset map view - now using device-appropriate view
  map.flyTo({...getMapView(), speed: 1.8});
  
  // Reset directory list
  reorderList(contacts);
  
  // Cancel any pending search
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  
  return false; // Prevent default form submission
}

// Show/hide mobile title based on screen width
function handleMobileTitle() {
  const mobileTitle = document.querySelector('.mobile-title');
  if (!mobileTitle) return;
  
  if (window.innerWidth <= 900) {
    mobileTitle.style.display = 'block';
  } else {
    mobileTitle.style.display = 'none';
  }
}

// Validate icon loading 
function checkIconsLoaded() {
  Object.entries(MARKER_ICONS).forEach(([key, url]) => {
    const img = new Image();
    img.onload = () => console.log(`✅ Icon "${key}" loaded successfully`);
    img.onerror = () => console.error(`❌ Icon "${key}" failed to load from: ${url}`);
    img.src = url;
  });
}

// Call icon validation on startup
checkIconsLoaded();

// ============ DEVICE SPECIFIC FUNCTIONS ============

// Get map view settings based on device type
function getMapView() {
  const isMobile = window.innerWidth <= 900;
  return isMobile 
    ? { center: DEFAULT_CENTER, zoom: MOBILE_ZOOM, pitch: 0, bearing: 0 }
    : { center: DEFAULT_CENTER, zoom: DESKTOP_ZOOM, pitch: 0, bearing: 0 };
}