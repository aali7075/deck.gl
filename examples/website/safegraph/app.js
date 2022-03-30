import mapboxgl from 'mapbox-gl';
import {MapboxLayer} from '@deck.gl/mapbox';
import {ArcLayer} from '@deck.gl/layers';
import {H3HexagonLayer} from '@deck.gl/geo-layers';
import {scaleLog} from 'd3-scale';
import {h3ToGeo} from 'h3-js';

import {load} from '@loaders.gl/core';
import {CSVLoader} from '@loaders.gl/csv';

// Set your mapbox token here
mapboxgl.accessToken ='pk.eyJ1IjoiYWFsaTcwNzUiLCJhIjoiY2wwbjM0dnJqMThkejNrbGFsaHNyY2VxZCJ9.HhRT9oD4i-ccz5WL4QszAg'; // eslint-disable-line

// Uses the fromula  y=m*log(x)+b
const colorScale = scaleLog()
  .domain([10, 100, 1000, 10000])
  .range([
    [255, 255, 178],
    [254, 204, 92],
    [253, 141, 60],
    [227, 26, 28]
  ]);

// Function will render the Map
export function renderToDOM(container, data) {
  //For more information about the map: https://docs.mapbox.com/mapbox-gl-js/api/map/
  const map = new mapboxgl.Map({ //The Map object is the map on your page
    container, // html element
    style: 'mapbox://styles/mapbox/dark-v9',
    antialias: true, // can turn off for better performance
    center: [-122.4034, 37.7845],
    zoom: 15.5,
    bearing: 20,
    pitch: 60
  });

  map.addControl(new mapboxgl.NavigationControl(), 'top-left');
  // listener for a event. In this case we're changing something when the map finshes loading
  map.on('load', () => {
    map.addLayer({ // adding the 3d layer after loading
      id: '3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', 'extrude', 'true'], // only dislplay features if extrude is true
      type: 'fill-extrusion', // fill color for extrusion
      minzoom: 14, // minimum zoom to be seen at that layer
      paint: {
        'fill-extrusion-color': '#ccc',
        'fill-extrusion-height': ['get', 'height']
      }
    });

    renderLayers(map, data); 
  });

  return {
    update: newData => renderLayers(map, newData),
    remove: () => {
      map.remove();
    }
  };
}


function renderLayers(map, data) {
  if (!data) {
    return;
  }
  let selectedPOICentroid;
  // MapboxLayer allows any deck.gl layer to be rendered into Mapbox instead of as seperate layers
  const arcLayer = new MapboxLayer({
    id: 'deckgl-connections',
    type: ArcLayer, // Creates an 3d arch 
    data: [],
    getSourcePosition: d => selectedPOICentroid,
    getTargetPosition: d => [d.home_lng, d.home_lat],
    getSourceColor: [255, 0, 128],
    getTargetColor: [0, 200, 255],
    getWidth: d => Math.max(2, d.count / 15)
  });

  const selectPOI = hex => { // puts in the values 
    const [lat, lng] = h3ToGeo(hex); // Gets the lat, lng given the hex id
    selectedPOICentroid = [lng, lat];
    arcLayer.setProps({
      data: data.filter(d => d.hex === hex) // only grab the data point with the correct hex
    });
  };

  const poiLayer = new MapboxLayer({
    id: 'deckgl-pois',
    type: H3HexagonLayer,
    data: aggregateHexes(data),
    opacity: 0.5,
    pickable: true,
    autoHighlight: true,
    // arrow function to return object and run selectPOI object return becomes d
    onClick: ({object}) => object && selectPOI(object.hex),
    getHexagon: d => d.hex,
    getFillColor: d => colorScale(d.count),
    extruded: false,
    stroked: false
  });
  // a style is a JSON document that defines the visual appearance of a map. 
  map.addLayer(poiLayer, getFirstLabelLayerId(map.getStyle()));
  map.addLayer(arcLayer);

  selectPOI('8a283082aa17fff');
}

function aggregateHexes(data) {
  const result = {};
  for (const object of data) {
    if (!result[object.hex]) {
      result[object.hex] = {hex: object.hex, count: 0};
    }
    result[object.hex].count += object.count;
  }
  return Object.values(result); // returns an array where each element is a tuple key value pair
}

function getFirstLabelLayerId(style) {
  const layers = style.layers;
  // Find the index of the first symbol (i.e. label) layer in the map style
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].type === 'symbol') {
      return layers[i].id;
    }
  }
  return undefined;
}

export async function loadAndRender(container) {
  const data = await load(
    'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/safegraph/sf-pois.csv',
    CSVLoader
  );
  renderToDOM(container, data);
}
