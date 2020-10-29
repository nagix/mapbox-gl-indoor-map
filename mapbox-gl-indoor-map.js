const STYLE = 'mapbox://styles/mapbox/dark-v10';
const CENTER = [139.7670, 35.6814];
const ZOOM = 15.95;
const ZOOM_SELECTION = 18.95;
const PITCH = 60;
const FLOOR_IDS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4];
const DELTA = 0.01;

const COLOR_MAIN = '#0f0';
const COLOR_HOVER = '#0ff';
const COLOR_SELECTION = '#ff0';
const COLOR_TEXT = '#fff';
const COLOR_HALO = '#333';

const OPACITY_FLOOR = 0.2;
const OPACITY_ROOM = 0.5;

mapboxgl.accessToken = 'pk.eyJ1IjoibmFnaXgiLCJhIjoiY2tnczJzdWN5MDdxdjJybW52cTZsNWNmeSJ9.j0l--AfS0-WFKxoHjdtWTQ';

function getNearestFeatureId(lngLat, features) {
    return features.map(feature => ({
        feature,
        distance: turf.distance([lngLat.lng, lngLat.lat], turf.centerOfMass(feature))
    })).sort((a, b) => a.distance - b.distance)[0].feature.id;
}

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

class IndoorMap extends mapboxgl.Map {

    constructor(options) {
        super(Object.assign({
            style: STYLE,
            center: CENTER,
            zoom: ZOOM,
            pitch: PITCH
        }, options));

        // Add zoom and rotation controls to the map.
        this.addControl(new mapboxgl.NavigationControl());

        this.toggleFloorButtons();

        this.on('load', this.onLoad.bind(this));
        this.on('zoom', this.onZoom.bind(this));
        this.on('pitch', this.onPitch.bind(this));
    }

    onLoad() {
        this.addSource('indoor', {
            type: 'vector',
            url: 'mapbox://mapbox.indoor-v1'
        });

        this.farthestLayerId = `floor-line-${FLOOR_IDS[0]}`;

        for (const floorId of FLOOR_IDS) {
            const opacity = this.getFloorOpacity(floorId);
            const translate = [0, this.getFloorTranslateY(floorId)];

            this.addLayer({
                id: `floor-line-${floorId}`,
                type: 'line',
                source: 'indoor',
                'source-layer': 'indoor_floorplan',
                filter: ['==', ['get', 'floor_id'], floorId],
                paint: {
                    'line-color': COLOR_MAIN,
                    'line-opacity': opacity,
                    'line-translate': translate,
                    'line-translate-anchor': 'viewport'
                }
            });

            this.addLayer({
                id: `structure-line-${floorId}`,
                type: 'line',
                source: 'indoor',
                'source-layer': 'indoor_structure',
                filter: ['==', ['get', 'floor_id'], floorId],
                paint: {
                    'line-color': COLOR_MAIN,
                    'line-opacity': opacity,
                    'line-translate': translate,
                    'line-translate-anchor': 'viewport'
                }
            });

            this.addLayer({
                id: `floor-fill-${floorId}`,
                type: 'fill-extrusion',
                source: 'indoor',
                'source-layer': 'indoor_floorplan',
                filter: [
                    'all',
                    ['==', ['get', 'floor_id'], floorId],
                    [
                        'any',
                        ['all', ['==', ['get', 'class'], 'area'], ['!=', ['get', 'type'], 'Room']],
                        ['==', ['get', 'class'], 'floor']
                    ]
                ],
                paint: {
                    'fill-extrusion-color': COLOR_MAIN,
                    'fill-extrusion-opacity': OPACITY_FLOOR * opacity,
                    'fill-extrusion-height': (+floorId - FLOOR_IDS[0]) * DELTA,
                    'fill-extrusion-translate': translate,
                    'fill-extrusion-translate-anchor': 'viewport'
                }
            });

            this.addLayer({
                id: `room-${floorId}`,
                type: 'fill-extrusion',
                source: 'indoor',
                'source-layer': 'indoor_floorplan',
                filter: [
                    'all',
                    ['==', ['get', 'floor_id'], floorId],
                    [
                        'all',
                        ['any', ['!=', ['get', 'class'], 'area'], ['==', ['get', 'type'], 'Room']],
                        ['!=', ['get', 'class'], 'floor']
                    ]
                ],
                paint: {
                    'fill-extrusion-color': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        COLOR_HOVER,
                        ['boolean', ['feature-state', 'selection'], false],
                        COLOR_SELECTION,
                        COLOR_MAIN
                    ],
                    'fill-extrusion-opacity': OPACITY_ROOM * opacity,
                    'fill-extrusion-height': 3 + (+floorId) * DELTA,
                    'fill-extrusion-translate': translate,
                    'fill-extrusion-translate-anchor': 'viewport'
                }
            });

            this.addLayer({
                id: `symbol-${floorId}`,
                type: 'symbol',
                source: 'indoor',
                'source-layer': 'indoor_poi_label',
                filter: ['==', ['get', 'floor_id'], floorId],
                layout: {
                    'text-field': ['get', 'name'],
                    'text-size': 12
                },
                paint: {
                    'text-color': COLOR_TEXT,
                    'text-opacity': 0,
                    'text-halo-color': COLOR_HALO,
                    'text-halo-blur': 1,
                    'text-halo-width': 1,
                    'text-translate': translate,
                    'text-translate-anchor': 'viewport'
                }
            });

            this.on('click', `room-${floorId}`, e => {
                this.hoverFeature();

                if ((isNaN(this.visibleFloorId) || floorId === this.visibleFloorId) && e.features.length > 0) {
                    this.selectFeature(getNearestFeatureId(e.lngLat, e.features));
                }
            });

            this.on('mousemove', `room-${floorId}`, e => {
                if ((isNaN(this.visibleFloorId) || floorId === this.visibleFloorId) && e.features.length > 0) {
                    this.hoverFeature(getNearestFeatureId(e.lngLat, e.features));
                }
            });

            this.on('mouseleave', `room-${floorId}`, () => {
                this.hoverFeature();
            });
        }
    }

    onZoom() {
        this.hoverFeature();
        this.updateMap();
    }

    onPitch() {
        this.hoverFeature();
        this.updateMap();
    }

    getFloorOpacity(floorId) {
        return isNaN(this.visibleFloorId) || floorId === this.visibleFloorId ? 1 : 0.1;
    }

    getFloorTranslateY(floorId) {
        const zoomFactor = Math.pow(2, this.getZoom() - 12);
        const pitchFactor = Math.sin(this.getPitch() * Math.PI / 180);

        return isNaN(this.visibleFloorId) ?
            -floorId * zoomFactor * pitchFactor :
            -(floorId - this.visibleFloorId) * zoomFactor * pitchFactor * 10;
    }

    toggleFloorButtons() {
        if (this.floorButtonControl) {
            this.removeControl(this.floorButtonControl);
            this.visibleFloorId = isNaN(this.visibleFloorId) ? this.floorIdForSelection || 0 : undefined;
        }

        this.floorButtonControl = new ButtonControl(isNaN(this.visibleFloorId) ? [{
            className: 'mapboxgl-ctrl-layer',
            title: 'Show floors',
            eventHandler: () => {
                this.toggleFloorButtons();
                this.selectFloor(this.visibleFloorId);
                this.updateMap();
            }
        }] : [{
            className: 'mapboxgl-ctrl-layer mapboxgl-ctrl-layer-active',
            title: 'Hide floors',
            eventHandler: () => {
                this.toggleFloorButtons();
                this.updateMap();
            }
        }, ...FLOOR_IDS.slice().reverse().map(floorId => ({
            className: `mapboxgl-ctrl-floor mapboxgl-ctrl-floor-${floorId}${floorId === this.visibleFloorId ? ' mapboxgl-ctrl-floor-active' : ''}`,
            title: floorId >= 0 ? `${floorId + 1}F` : `B${-floorId}F`,
            eventHandler: () => {
                if (floorId !== this.visibleFloorId) {
                    this.selectFloor(floorId);
                }
            }
        }))]);
        this.addControl(this.floorButtonControl);
    }

    selectFloor(floorId) {
        if (!isNaN(this.visibleFloorId)) {
            const activeButtons = document.getElementsByClassName('mapboxgl-ctrl-floor-active');

            if (activeButtons.length > 0) {
                activeButtons[0].classList.remove('mapboxgl-ctrl-floor-active');
            }
            this.visibleFloorId = floorId;
            document
                .getElementsByClassName(`mapboxgl-ctrl-floor-${floorId}`)[0]
                .classList.add('mapboxgl-ctrl-floor-active');
            this.updateMap();

            setTimeout(() => {
                this.moveLayer(`floor-fill-${floorId}`, this.farthestLayerId);
                this.moveLayer(`room-${floorId}`, this.farthestLayerId);
                this.farthestLayerId = `floor-fill-${floorId}`;
            }, 150);
        }
    }

    updateMap() {
        for (const floorId of FLOOR_IDS) {
            const opacity = this.getFloorOpacity(floorId);
            const translate = [0, this.getFloorTranslateY(floorId)];

            this.setPaintProperty(`floor-line-${floorId}`, 'line-opacity', opacity);
            this.setPaintProperty(`structure-line-${floorId}`, 'line-opacity', opacity);
            this.setPaintProperty(`floor-fill-${floorId}`, 'fill-extrusion-opacity', 0.2 * opacity);
            this.setPaintProperty(`room-${floorId}`, 'fill-extrusion-opacity', 0.5 * opacity);
            this.setPaintProperty(`symbol-${floorId}`, 'text-opacity', floorId === this.visibleFloorId ? 1 : 0);

            this.setPaintProperty(`floor-line-${floorId}`, 'line-translate', translate);
            this.setPaintProperty(`structure-line-${floorId}`, 'line-translate', translate);
            this.setPaintProperty(`floor-fill-${floorId}`, 'fill-extrusion-translate', translate);
            this.setPaintProperty(`room-${floorId}`, 'fill-extrusion-translate', translate);
            this.setPaintProperty(`symbol-${floorId}`, 'text-translate', translate);
        }
    }

    hoverFeature(id) {
        if (this.hoveredId) {
            this.setFeatureState(
                {source: 'indoor', sourceLayer: 'indoor_floorplan', id: this.hoveredId},
                {hover: false}
            );
        }
        if (id !== undefined) {
            this.hoveredId = id;
            this.setFeatureState(
                {source: 'indoor', sourceLayer: 'indoor_floorplan', id: this.hoveredId},
                {hover: true}
            );
            this.getCanvas().style.cursor = 'pointer';
        } else {
            this.hoveredId = undefined;
            this.getCanvas().style.cursor = '';
        }
    }

    selectFeature(id) {
        if (this.selection) {
            this.setFeatureState(
                {source: 'indoor', sourceLayer: 'indoor_floorplan', id: this.selection},
                {selection: false}
            );
        }

        this.selection = id;

        if (this.selection) {
            const feature = this.querySourceFeatures('indoor', {
                sourceLayer: 'indoor_floorplan',
                filter: ['==', ['id'], this.selection]
            });

            if (feature.length > 0) {
                const floorId = this.floorIdForSelection = feature[0].properties.floor_id;

                this.selectFloor(floorId);

                const translateY = this.getFloorTranslateY(floorId);

                this.easeTo({
                    center: turf.getCoord(turf.centerOfMass(feature[0])),
                    zoom: ZOOM_SELECTION,
                    padding: translateY < 0 ? {top: -translateY} : {bottom: translateY}
                });
            }

            this.setFeatureState(
                {source: 'indoor', sourceLayer: 'indoor_floorplan', id: this.selection},
                {selection: true}
            );
        }
    }

}
