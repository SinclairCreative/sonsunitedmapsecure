mapboxgl.accessToken =
      'pk.eyJ1IjoianVzdGluc2luY2xhaXJjcmVhdGl2ZSIsImEiOiJjbTl2dmJ2Z20wb3M4MnFtdzVqZ3l1YTdtIn0.yRr3osd2oFqcKbjg_3O1Hg';
    const sheetId = '1v-IuJlxT5PFTEsTopN53KgqWilZ1x6maVZv_k64CMF0',
          gid     = '0';
    const defaultView = { center:[-97.695029, 37.443203], zoom:3.78, pitch:0, bearing:0 };
    const icons = {
      default: 'icons/sons.png',
      hover: 'icons/sonshover.png',
      click: 'icons/sonsclick.png'
    };

    const stateNames = {
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

    let contacts=[], clusterIndex, markers={}, selectedIdx=null;
    const spinner      = document.getElementById('spinner'),
          basicInfo    = document.getElementById('basic-info'),
          toggleBtn    = document.getElementById('toggle-details'),
          extraDetails = document.getElementById('extra-details'),
          sortSelect   = document.getElementById('sort-select'),
          contactList  = document.getElementById('contact-list');

    const map=new mapboxgl.Map({
      container:'map',
      style:'mapbox://styles/justinsinclaircreative/cma43snlr002t01sih71s9nng',
      ...defaultView
    });

    map.on('load', () => {
      console.log("Map loaded, setting up markers...");
      Promise.all([
        new Promise((r, j) => map.loadImage(icons.default, (e, i) => e ? j(e) : r(['default', i]))),
        new Promise((r, j) => map.loadImage(icons.hover, (e, i) => e ? j(e) : r(['hover', i]))),
        new Promise((r, j) => map.loadImage(icons.click, (e, i) => e ? j(e) : r(['click', i]))),
      ]).then(imgs => {
        console.log("All marker images loaded");
        imgs.forEach(([n, i]) => map.addImage(n, i));
        
        fetchData();
      }).catch(error => {
        console.error("Error loading marker images:", error);
      });
    });

    // Custom map controls
    document.getElementById('zoom-in').onclick = () => map.zoomIn();
    document.getElementById('zoom-out').onclick = () => map.zoomOut();
    document.getElementById('recenter').onclick = () => map.flyTo({...defaultView, speed: 2});

    function fetchData() {
      spinner.style.display = 'block';
      basicInfo.textContent = 'Loading contacts…';
      gapi.load('client', () => {
        gapi.client.init({
          apiKey: 'AIzaSyDxkaHehVwvFf6s7f5Y-UtgsefOp6EZtgI',                  // ← your API key here
          discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
        }).then(() => {
          return gapi.client.sheets.spreadsheets.get({ spreadsheetId: sheetId });
        }).then(meta => {
          const name = meta.result.sheets[0].properties.title;
          return gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${name}!A2:I`
          });
        }).then(res => {
          const rows = res.result.values||[];
          contacts = rows.map(r=>({
            email: r[0]||'', fullName:r[1]||'', phone:r[2]||'',
            zip:r[3]||'', city:r[4]||'', state:r[5]||'',
            career:r[6]||'', strengths:r[7]||'', notes:r[8]||'',
            address:'', coords:null
          }));
          contacts.forEach(c=>c.address=[c.city,c.state,c.zip].filter(Boolean).join(', '));
          basicInfo.textContent = `${contacts.length} members:`;
          geocodeAll();
        }).catch(err=>{
          console.error('Sheet load error',err);
          basicInfo.innerHTML = `<em>Error: ${err.message}</em>`;
          spinner.style.display='none';
        });
      });
    }
    async function geocodeAll() {
      console.log("Starting geocoding for", contacts.length, "contacts");
      let geocodeSuccessCount = 0;
      
      // Process contacts in smaller batches to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (r, batchIndex) => {
          const index = i + batchIndex;
          // Only process if we have location data
          if (!r.city && !r.state && !r.zip) {
            console.warn(`Contact ${index}: Missing location data, skipping geocoding`);
            return;
          }
          
          const geocodeString = [r.city, r.state, r.zip].filter(Boolean).join(', ');
          console.log(`Contact ${index}: Geocoding "${geocodeString}"`);
          const key = `geo_${geocodeString}`;
          const st = localStorage.getItem(key);
          
          if (st) {
            try {
              r.coords = JSON.parse(st);
              geocodeSuccessCount++;
              console.log(`Contact ${index}: Using cached coordinates [${r.coords[0]}, ${r.coords[1]}]`);
            } catch (e) {
              console.warn(`Contact ${index}: Invalid cached coordinates, will re-geocode`);
              localStorage.removeItem(key);
            }
          }
          
          if (!r.coords) {
            try {
              console.log(`Contact ${index}: Fetching coordinates for "${geocodeString}"`);
              const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(geocodeString)}.json?access_token=${mapboxgl.accessToken}`
              );
              const js = await response.json();
              
              if (js.features && js.features.length > 0) {
                r.coords = js.features[0].geometry.coordinates;
                localStorage.setItem(key, JSON.stringify(r.coords));
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
          }
        }));
        
        // Add a small delay between batches to avoid rate limiting
        if (i + batchSize < contacts.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`Geocoding completed: ${geocodeSuccessCount}/${contacts.length} successful`);
      
      // Filter out contacts with invalid coordinates
      const validContacts = contacts.filter(r => r.coords && (r.coords[0] !== 0 || r.coords[1] !== 0));
      console.log(`Valid contacts with coordinates: ${validContacts.length}`);
      
      spinner.style.display = 'none';
      buildClusterIndex();
      sortSelect.value = 'state';
      initList();
      updateSearchSuggestions();
    }

    function updateSearchSuggestions() {
      const datalist = document.getElementById('search-suggestions');
      if (!datalist) return;
      datalist.innerHTML = '';
      const q = document.getElementById('search')?.value.trim().toLowerCase();
      if (!q) return;

      contacts.forEach(r => {
        const matches = [];

        // name, email, phone, address, city as before
        if (r.fullName.toLowerCase().includes(q))  matches.push({ field:'Name',    label: r.fullName });
        if (r.email.toLowerCase().includes(q))     matches.push({ field:'Email',   label: r.email });
        if (r.phone.toLowerCase().includes(q))     matches.push({ field:'Phone',   label: r.phone });
        if (r.address.toLowerCase().includes(q))   matches.push({ field:'Address', label: r.address });
        if (r.city.toLowerCase().includes(q))      matches.push({ field:'City',    label: r.city });

        // state matching: abbreviation or full name
        const abbr = (r.state||'').toUpperCase();
        const full = stateNames[abbr] || '';
        if (abbr && (abbr.toLowerCase().includes(q) || full.toLowerCase().includes(q))) {
          const label = full ? `${abbr} (${full})` : abbr;
          matches.push({ field:'State', label });
        }

        // zip code
        if (r.zip.toLowerCase().includes(q))       matches.push({ field:'Zip',     label: r.zip });

        if (matches.length) {
          const detailText = matches.map(m => `${m.field}: ${m.label}`).join(', ');
          const opt = document.createElement('option');
          opt.value = r.fullName;
          opt.label = `${r.fullName} — ${detailText}`;
          datalist.appendChild(opt);
        }
      });
    }

    document.getElementById('search').addEventListener('input', updateSearchSuggestions);

    function buildClusterIndex(){
      console.log("Building cluster index with contacts:", contacts.length);
      
      // Filter out contacts without valid coordinates
      const validContacts = contacts.filter(r => r.coords && Array.isArray(r.coords) && r.coords.length === 2);
      console.log(`Valid contacts for clustering: ${validContacts.length}`);
      
      const feats = validContacts.map((r,i) => ({
        type: 'Feature',
        id: contacts.indexOf(r),
        geometry: { type: 'Point', coordinates: r.coords },
        properties: {}
      }));
      
      console.log(`Created ${feats.length} features for clustering`);
      
      clusterIndex = new Supercluster({radius: 60, maxZoom: 16});
      clusterIndex.load(feats);
      
      // Remove previous event listener if any
      map.off('moveend', updateClusters);
      map.on('moveend', updateClusters);
      
      updateClusters();
    }

    function updateClusters() {
      try {
        console.log("Updating clusters...");
        const bbox = map.getBounds().toArray().flat();
        const z = Math.floor(map.getZoom());
        console.log(`Current map view: zoom ${z}, bounds ${bbox}`);

        const cls = clusterIndex.getClusters(bbox, z);
        console.log(`Found ${cls.length} clusters/points in current view`);

        // Determine which markers should be visible
        const need = new Set();
        cls.forEach(c => {
          need.add(c.properties.cluster
            ? `c_${c.properties.cluster_id}`
            : `p_${c.id}`);
        });

        // Hide or show existing markers via visibility (reduces DOM reflow flicker)
        Object.keys(markers).forEach(k => {
          const el = markers[k].getElement();
          el.style.visibility = need.has(k) ? 'visible' : 'hidden';
        });

        // Create or update markers
        cls.forEach(c => {
          if (c.properties.cluster) {
            // Cluster marker logic unchanged...
            const key = `c_${c.properties.cluster_id}`;
            const [lng, lat] = c.geometry.coordinates;
            if (!markers[key]) {
              const cnt = c.properties.point_count_abbreviated;
              const el = document.createElement('div');
              el.className = 'cluster-marker pop-in';
              el.textContent = cnt;
              const size = 20 + cnt * 5;
              el.style.width = `${size}px`;
              el.style.height = `${size}px`;
              el.onclick = () => {
                const ez = clusterIndex.getClusterExpansionZoom(c.properties.cluster_id);
                map.easeTo({ center: [lng, lat], zoom: ez, speed: 2 });
              };
              // remove pop-in after animation
              el.addEventListener('animationend', () => el.classList.remove('pop-in'));
              markers[key] = new mapboxgl.Marker(el)
                .setLngLat([lng, lat])
                .addTo(map);
              console.log(`Created cluster marker at [${lng}, ${lat}] with ${cnt} points`);
            } else {
              markers[key].setLngLat(c.geometry.coordinates);
            }
          } else {
            // Individual pin with hover & click states
            const key = `p_${c.id}`;
            const [lng, lat] = c.geometry.coordinates;
            if (!markers[key]) {
              const img = document.createElement('img');
              img.className = 'marker-icon pop-in';
              img.src = icons.default;
              // hover state
              img.addEventListener('mouseenter', () => img.src = icons.hover);
              img.addEventListener('mouseleave', () => {
                img.src = (c.id === selectedIdx ? icons.click : icons.default);
              });
              // click state
              img.addEventListener('click', () => onContactClick(c.id));
              // remove pop-in after animation
              img.addEventListener('animationend', () => img.classList.remove('pop-in'));
              markers[key] = new mapboxgl.Marker(img)
                .setLngLat([lng, lat])
                .addTo(map);
              console.log(`Created pin marker at [${lng}, ${lat}] for contact #${c.id}`);
            } else {
              markers[key].setLngLat([lng, lat]);
            }
          }
        });

        console.log("Clusters update completed");
      } catch (err) {
        console.error("Error in updateClusters:", err);
      }
    }

    document.getElementById('show-all').onclick = () => {
      map.flyTo({ ...defaultView, speed: 2 });
    };

    // Add debounce to search input to prevent excessive processing
    let searchTimeout;
    document.getElementById('search').oninput = e => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const q = e.target.value.toLowerCase(),
              f=contacts.filter(r=>[r.fullName,r.email,r.phone,r.address].join(' ').toLowerCase().includes(q)),
              feats=f.map(r=>({type:'Feature',id:contacts.indexOf(r),geometry:{type:'Point',coordinates:r.coords},properties:{}}));
        clusterIndex.load(feats);
        updateClusters();
        reorderList(f);
      }, 300);
    };

    document.getElementById('download').onclick = () => {
      const header = ['Full Name', 'City', 'State', 'Zip Code', 'Email', 'Phone', 'Career/Work', 'Strengths/Interests', 'Notes'];
      const rows = [header, ...contacts.map(r => [
        r.fullName,
        r.city || '',
        r.state || '',
        r.zip || '',
        r.email,
        r.phone,
        r.career,
        r.strengths,
        r.notes
      ])];
      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const b = new Blob([csv], {type: 'text/csv'});
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u;
      a.download = 'contacts.csv';
      a.click();
      URL.revokeObjectURL(u);
    };

    sortSelect.onchange=()=>reorderList(contacts);

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

    function reorderList(list) {
      contactList.innerHTML = '';
      const crit = sortSelect.value;
      const inViewIdxs = new Set(getContactsInView());
      const activeIdx = selectedIdx;

      function makeLi(r, idx) {
        const li = document.createElement('li');
        li.textContent = r.fullName;
        li.tabIndex = 0;
        if (idx === activeIdx) li.classList.add('active-contact');
        else if (inViewIdxs.has(idx)) li.classList.add('in-view');
        li.onclick = (e) => {
          e.stopPropagation();
          // Cluster expansion logic...
          if (r.coords) {
            const zoom = map.getZoom();
            const clusters = clusterIndex.getClusters(map.getBounds().toArray().flat(), Math.floor(zoom));
            let foundCluster = null;
            for (const c of clusters) {
              if (c.properties && c.properties.cluster) {
                const leaves = clusterIndex.getLeaves(c.properties.cluster_id, Infinity);
                if (leaves.some(l => l.id === idx)) {
                  foundCluster = c;
                  break;
                }
              }
            }
            if (foundCluster) {
              const clusterId = foundCluster.properties.cluster_id;
              const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
              map.easeTo({ center: r.coords, zoom: expansionZoom, speed: 2 });
              setTimeout(() => {
                map.flyTo({ center: r.coords, zoom: Math.max(expansionZoom, 8), speed: 2 });
                onContactClick(idx);
              }, 600);
            } else {
              map.flyTo({ center: r.coords, zoom: Math.max(zoom, 8), speed: 2 });
              onContactClick(idx);
            }
          } else {
            onContactClick(idx);
          }
        };
        return li;
      }

      // Sort by current sort criterion
      let sorted = [...list];
      function sortFn(a, b) {
        if (crit === 'first') {
          return a.fullName.localeCompare(b.fullName);
        }
        if (crit === 'last') {
          const la = a.fullName.split(' ').slice(-1)[0],
                lb = b.fullName.split(' ').slice(-1)[0];
          return la.localeCompare(lb);
        }
        if (crit === 'state') {
          // sort by state property (not zip)
          const sa = (a.state || '').toUpperCase(),
                sb = (b.state || '').toUpperCase();
          return sa.localeCompare(sb) || a.fullName.localeCompare(b.fullName);
        }
        if (crit === 'career') {
          return (a.career || '').localeCompare(b.career || '') || a.fullName.localeCompare(b.fullName);
        }
        return 0;
      }
      sorted.sort(sortFn);

      // Partition into in-view and not-in-view, preserving sort order
      const withIdx = sorted.map(r => ({ r, idx: contacts.indexOf(r) }));
      const inView     = withIdx.filter(x => inViewIdxs.has(x.idx) && x.idx !== activeIdx);
      const notInView  = withIdx.filter(x => !inViewIdxs.has(x.idx) && x.idx !== activeIdx);

      // Render active contact at the very top
      if (activeIdx !== null && contacts[activeIdx]) {
        contactList.appendChild(makeLi(contacts[activeIdx], activeIdx));
      }

      // If simple sort (first), just list them
      if (crit === 'first') {
        [...inView, ...notInView].forEach(({ r, idx }) => contactList.appendChild(makeLi(r, idx)));
        return;
      }

      // Grouped sort (last, state, career)
      const groupBy = (arr) => {
        const groups = {};
        arr.forEach(({ r, idx }) => {
          let key = '';
          if (crit === 'last')   key = r.fullName.split(' ').slice(-1)[0][0].toUpperCase();
          if (crit === 'state')  key = (r.state || '').toUpperCase();   // group by state
          if (crit === 'career') key = r.career || '';
          groups[key] = groups[key] || [];
          groups[key].push({ r, idx });
        });
        return groups;
      };

      // Render in-view groups
      const inViewGroups = groupBy(inView);
      Object.keys(inViewGroups).sort().forEach(hdr => {
        const hli = document.createElement('li');
        hli.textContent = hdr;
        hli.className = 'list-header';
        contactList.appendChild(hli);
        inViewGroups[hdr].forEach(({ r, idx }) => contactList.appendChild(makeLi(r, idx)));
      });

      // Render not-in-view groups
      const notInViewGroups = groupBy(notInView);
      Object.keys(notInViewGroups).sort().forEach(hdr => {
        const hli = document.createElement('li');
        hli.textContent = hdr;
        hli.className = 'list-header';
        contactList.appendChild(hli);
        notInViewGroups[hdr].forEach(({ r, idx }) => contactList.appendChild(makeLi(r, idx)));
      });
    }

    map.on('moveend', () => reorderList(contacts));

    function onContactClick(i){
      if(selectedIdx!==null){
        const oldMk=markers[`p_${selectedIdx}`];
        if(oldMk) oldMk.getElement().src=icons.default;
      }
      selectedIdx=i;
      const newMk=markers[`p_${i}`];
      if(newMk) newMk.getElement().src=icons.click;
      showInfo(i);
      document.getElementById('info-box').classList.add('expanded');
      reorderList(contacts);
    }

    function showDefaultInfo() {
      basicInfo.innerHTML = `<em>${contacts.length} Sons United members:</em>`;
      extraDetails.innerHTML = '';
      extraDetails.style.display = 'none';
      toggleBtn.classList.remove('visible');
      document.getElementById('info-box').classList.remove('expanded');
    }
    function showInfo(i) {
      const r = contacts[i];
      const cityStateZip = [r.city, r.state, r.zip].filter(Boolean).join(', ');
      
      basicInfo.innerHTML = `
        <div class="name-row">
          <h3>${r.fullName}</h3>
          <button id="toggle-details" class="visible">Details</button>
        </div>
        <div class="contact-info">
          <p>${cityStateZip}</p>
          <p>${r.email}</p>
          <p>${r.phone}</p>
        </div>`;
      
      extraDetails.innerHTML = `
        <p><strong>Career/Work:</strong> ${r.career || 'Not specified'}</p>
        <p><strong>Strengths/Interests:</strong> ${r.strengths || 'Not specified'}</p>
        <p><strong>Notes:</strong> ${r.notes || 'None'}</p>`;
      
      extraDetails.style.display = 'none';
      document.getElementById('info-box').classList.add('expanded');
      
      // Reattach event listener to the newly created button
      document.getElementById('toggle-details').onclick = function() {
        if (extraDetails.style.display === 'none' || extraDetails.style.display === '') {
          extraDetails.style.display = 'block';
          this.textContent = 'Hide Details';
        } else {
          extraDetails.style.display = 'none';
          this.textContent = 'Details';
        }
      };
    }

    // Modify the onContactClick function to use our new toggle function
    function onContactClick(i) {
      if(selectedIdx !== null) {
        const oldMk = markers[`p_${selectedIdx}`];
        if(oldMk) oldMk.getElement().src = icons.default;
      }
      selectedIdx = i;
      const newMk = markers[`p_${i}`];
      if(newMk) newMk.getElement().src = icons.click;
      showInfo(i);
      document.getElementById('info-box').classList.add('expanded');
      reorderList(contacts);
    }

    // Update the original toggleBtn.onclick to use our new function
    toggleBtn.onclick = toggleExtraDetails;

    if (contacts.length === 0) {
      basicInfo.innerHTML = `<em>Loading contacts…</em>`;
      document.getElementById('info-box').classList.remove('expanded');
    }
    toggleBtn.classList.remove('visible');

    document.body.addEventListener('click', function(e) {
      if (
        !e.target.closest('#contact-list') &&
        !e.target.closest('#info-box') &&
        !e.target.closest('.marker-icon')
      ) {
        selectedIdx = null;
        showDefaultInfo();
        reorderList(contacts);
        Object.keys(markers).forEach(k => {
          if (k.startsWith('p_')) {
            markers[k].getElement().src = icons.default;
          }
        });
      }
    });

    function initList() {
      reorderList(contacts);
      contactList.scrollTop = 0;
    }

    initList();

    // Show/hide mobile title based on screen width
    function handleMobileTitle() {
      const mobileTitle = document.querySelector('.mobile-title');
      if (window.innerWidth <= 900) {
        mobileTitle.style.display = 'block';
      } else {
        mobileTitle.style.display = 'none';
      }
    }
    window.addEventListener('resize', handleMobileTitle);
    window.addEventListener('DOMContentLoaded', handleMobileTitle);

    // Test icon loading
    Object.entries(icons).forEach(([key, url]) => {
      const img = new Image();
      img.onload = () => console.log(`✅ Icon "${key}" loaded successfully`);
      img.onerror = () => console.error(`❌ Icon "${key}" failed to load from: ${url}`);
      img.src = url;
    });

    // Add these near the top of your file for immediate troubleshooting
    console.log("Script started");
    window.onerror = function(msg, url, line) {
      console.error(`Error: ${msg} at ${url}:${line}`);
      return false;
    };