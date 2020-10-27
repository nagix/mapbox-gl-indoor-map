const FLOOR_IDS = [-4, -3, -2, -1, 0, 1, 2, 3];
const DELTA = 0.01;

let visibleFloorId;
let floorIdForSelection;
let floorButtonControl;
let farthestLayerId;
let selection;
let hoveredId;

mapboxgl.accessToken = 'pk.eyJ1IjoibmFnaXgiLCJhIjoiY2tnczJzdWN5MDdxdjJybW52cTZsNWNmeSJ9.j0l--AfS0-WFKxoHjdtWTQ';

class ButtonControl {
    constructor(optionArray) {
        this._options = optionArray.map(options => ({
            className: options.className || '',
            title: options.title || '',
            eventHandler: options.eventHandler
        }));
    }

    onAdd(map) {
        const me = this;

        me._map = map;

        me._container = document.createElement('div');
        me._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

        me._buttons = me._options.map(options => {
            const button = document.createElement('button'),
                icon = document.createElement('span'),
                {className, title, eventHandler} = options;

            button.className = className;
            button.type = 'button';
            button.title = title;
            button.setAttribute('aria-label', title);
            button.onclick = eventHandler;

            icon.className = 'mapboxgl-ctrl-icon';
            icon.setAttribute('aria-hidden', true);
            button.appendChild(icon);

            me._container.appendChild(button);

            return button;
        });

        return me._container;
    }

    onRemove() {
        const me = this;

        me._container.parentNode.removeChild(me._container);
        me._map = undefined;
    }
}

function toggleFloorButtons() {
    if (floorButtonControl) {
        map.removeControl(floorButtonControl);
        visibleFloorId = isNaN(visibleFloorId) ? floorIdForSelection || 0 : undefined;
    }

    floorButtonControl = new ButtonControl(isNaN(visibleFloorId) ? [{
        className: 'mapboxgl-ctrl-layer',
        title: 'Show floors',
        eventHandler: () => {
            toggleFloorButtons();
            selectFloor(visibleFloorId);
            updateMap();
        }
    }] : [{
        className: 'mapboxgl-ctrl-layer mapboxgl-ctrl-layer-active',
        title: 'Hide floors',
        eventHandler: () => {
            toggleFloorButtons();
            updateMap();
        }
    }, ...FLOOR_IDS.slice().reverse().map(floorId => ({
        className: `mapboxgl-ctrl-floor mapboxgl-ctrl-floor-${floorId}${floorId === visibleFloorId ? ' mapboxgl-ctrl-floor-active' : ''}`,
        title: floorId >= 0 ? `${floorId + 1}F` : `B${-floorId}F`,
        eventHandler: () => {
            if (floorId !== visibleFloorId) {
                selectFloor(floorId);
            }
        }
    }))]);
    map.addControl(floorButtonControl);
}

function selectFloor(floorId) {
  if (!isNaN(visibleFloorId)) {
    const activeButtons = document.getElementsByClassName('mapboxgl-ctrl-floor-active');

    if (activeButtons.length > 0) {
        activeButtons[0].classList.remove('mapboxgl-ctrl-floor-active');
    }
    visibleFloorId = floorId;
    document
        .getElementsByClassName(`mapboxgl-ctrl-floor-${floorId}`)[0]
        .classList.add('mapboxgl-ctrl-floor-active');
    updateMap();

    setTimeout(() => {
        map.moveLayer(`floor-fill-${floorId}`, farthestLayerId);
        map.moveLayer(`room-${floorId}`, farthestLayerId);
        farthestLayerId = `floor-fill-${floorId}`;
    }, 150);
  }
}

function updateMap() {
    const zoomFactor = Math.pow(2, map.getZoom() - 12);
    const pitchFactor = Math.sin(map.getPitch() * Math.PI / 180);

    for (const floorId of FLOOR_IDS) {
        const opacity = isNaN(visibleFloorId) || floorId === visibleFloorId ? 1 : 0.1;
        const translate = [0, isNaN(visibleFloorId) ?
            -floorId * zoomFactor * pitchFactor :
            -(floorId - visibleFloorId) * zoomFactor * pitchFactor * 10];

        map.setPaintProperty(`floor-line-${floorId}`, 'line-opacity', opacity);
        map.setPaintProperty(`structure-line-${floorId}`, 'line-opacity', opacity);
        map.setPaintProperty(`floor-fill-${floorId}`, 'fill-extrusion-opacity', 0.2 * opacity);
        map.setPaintProperty(`room-${floorId}`, 'fill-extrusion-opacity', 0.5 * opacity);

        map.setPaintProperty(`floor-line-${floorId}`, 'line-translate', translate);
        map.setPaintProperty(`structure-line-${floorId}`, 'line-translate', translate);
        map.setPaintProperty(`floor-fill-${floorId}`, 'fill-extrusion-translate', translate);
        map.setPaintProperty(`room-${floorId}`, 'fill-extrusion-translate', translate);
    }
}

function hoverFeature(id) {
    if (hoveredId) {
        map.setFeatureState(
            {source: 'indoor', sourceLayer: 'indoor_floorplan', id: hoveredId},
            {hover: false}
        );
    }
    if (id !== undefined) {
        hoveredId = id;
        map.setFeatureState(
            {source: 'indoor', sourceLayer: 'indoor_floorplan', id: hoveredId},
            {hover: true}
        );
        map.getCanvas().style.cursor = 'pointer';
    } else {
        hoveredId = undefined;
        map.getCanvas().style.cursor = '';
    }
}

function onSelect(id) {
    if (selection) {
        map.setFeatureState(
            {source: 'indoor', sourceLayer: 'indoor_floorplan', id: selection},
            {selection: false}
        );
    }

    selection = id;

    if (selection) {
        const feature = map.querySourceFeatures('indoor', {
            sourceLayer: 'indoor_floorplan',
            filter: ['==', ['id'], selection]
        });

        if (feature.length > 0) {
            const floorId = floorIdForSelection = feature[0].properties.floor_id;

            selectFloor(floorId);

            const zoomFactor = Math.pow(2, 18.95 - 12);
            const pitchFactor = Math.sin(map.getPitch() * Math.PI / 180);
            const translateY = isNaN(visibleFloorId) ?
              -floorId * zoomFactor * pitchFactor :
              -(floorId - visibleFloorId) * zoomFactor * pitchFactor * 10;

            map.easeTo({
                center: turf.getCoord(turf.centerOfMass(feature[0])),
                zoom: 18.95,
                padding: translateY < 0 ? {top: -translateY} : {bottom: translateY}
            });
        }

        map.setFeatureState(
            {source: 'indoor', sourceLayer: 'indoor_floorplan', id: selection},
            {selection: true}
        );
    }
}

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v10',
    center: [139.7670, 35.6814],
    zoom: 15.95,
    pitch: 60
});

// Add zoom and rotation controls to the map.
map.addControl(new mapboxgl.NavigationControl());

toggleFloorButtons();

map.on('load', () => {
    const zoomFactor = Math.pow(2, map.getZoom() - 12);
    const pitchFactor = Math.sin(map.getPitch() * Math.PI / 180);

    map.addSource('indoor', {
        type: 'vector',
        url: 'mapbox://mapbox.indoor-v1'
    });

    farthestLayerId = `floor-line-${FLOOR_IDS[0]}`;

    for (const floorId of FLOOR_IDS) {
        const opacity = isNaN(visibleFloorId) || floorId === visibleFloorId ? 1 : 0.1;
        const translate = [0, isNaN(visibleFloorId) ?
            -floorId * zoomFactor * pitchFactor :
            -(floorId - visibleFloorId) * zoomFactor * pitchFactor * 10];

        map.addLayer({
            id: `floor-line-${floorId}`,
            type: 'line',
            source: 'indoor',
            'source-layer': 'indoor_floorplan',
            filter: ['==', ['get', 'floor_id'], floorId],
            paint: {
                'line-color': '#0f0',
                'line-opacity': opacity,
                'line-translate': translate,
                'line-translate-anchor': 'viewport'
            }
        });

        map.addLayer({
            id: `structure-line-${floorId}`,
            type: 'line',
            source: 'indoor',
            'source-layer': 'indoor_structure',
            filter: ['==', ['get', 'floor_id'], floorId],
            paint: {
                'line-color': '#0f0',
                'line-opacity': opacity,
                'line-translate': translate,
                'line-translate-anchor': 'viewport'
            }
        });

        map.addLayer({
            id: `floor-fill-${floorId}`,
            type: 'fill-extrusion',
            source: 'indoor',
            'source-layer': 'indoor_floorplan',
            filter: [
                'all',
                ['==', ['get', 'floor_id'], floorId],
                ['any', ['all', ['==', ['get', 'class'], 'area'], ['!=', ['get', 'type'], 'Room']], ['==', ['get', 'class'], 'floor']]
            ],
            paint: {
                'fill-extrusion-color': '#0f0',
                'fill-extrusion-opacity': 0.2 * opacity,
                'fill-extrusion-height': (+floorId - FLOOR_IDS[0]) * DELTA,
                'fill-extrusion-translate': translate,
                'fill-extrusion-translate-anchor': 'viewport'
            }
        });

        map.addLayer({
            id: `room-${floorId}`,
            type: 'fill-extrusion',
            source: 'indoor',
            'source-layer': 'indoor_floorplan',
            filter: [
                'all',
                ['==', ['get', 'floor_id'], floorId],
                ['all', ['any', ['!=', ['get', 'class'], 'area'], ['==', ['get', 'type'], 'Room']], ['!=', ['get', 'class'], 'floor']]
            ],
            paint: {
                'fill-extrusion-color': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    '#0ff',
                    ['boolean', ['feature-state', 'selection'], false],
                    '#ff0',
                    '#0f0'
                ],
                'fill-extrusion-opacity': 0.5 * opacity,
                'fill-extrusion-height': 3 + (+floorId) * DELTA,
                'fill-extrusion-translate': translate,
                'fill-extrusion-translate-anchor': 'viewport'
            }
        });

        map.on('click', `room-${floorId}`, e => {
            hoverFeature();

            if ((isNaN(visibleFloorId) || floorId === visibleFloorId) && e.features.length > 0) {
                onSelect(e.features[0].id);
            }
        });

        map.on('mousemove', `room-${floorId}`, e => {
            if ((isNaN(visibleFloorId) || floorId === visibleFloorId) && e.features.length > 0) {
                hoverFeature(e.features[0].id);
            }
        });

        map.on('mouseleave', `room-${floorId}`, () => {
            hoverFeature();
        });
    }
});

map.on('zoom', () => {
    hoverFeature();
    updateMap();
});

map.on('pitch', () => {
    hoverFeature();
    updateMap();
});
