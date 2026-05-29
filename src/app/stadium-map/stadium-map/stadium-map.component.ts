import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ChangeDetectorRef, NgZone
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import * as L from 'leaflet';

export interface Stadium {
  team: string;
  abbr: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  weather?: StadiumWeather;
  loadingWeather?: boolean;
}

export interface StadiumWeather {
  temp: number;       // °F
  tempC: number;      // °C
  condition: string;
  windSpeed: number;  // mph
  windDir: number;
  precipitation: number; // mm/h
  humidity: number;
  icon: string;       // WMO code mapped to emoji
  isDay: boolean;
}

const WMO_CODES: Record<number, { label: string; emoji: string }> = {
  0:  { label: 'Clear',           emoji: '☀️'  },
  1:  { label: 'Mainly Clear',    emoji: '🌤️' },
  2:  { label: 'Partly Cloudy',   emoji: '⛅'  },
  3:  { label: 'Overcast',        emoji: '☁️'  },
  45: { label: 'Foggy',           emoji: '🌫️' },
  48: { label: 'Icy Fog',         emoji: '🌫️' },
  51: { label: 'Light Drizzle',   emoji: '🌦️' },
  53: { label: 'Drizzle',         emoji: '🌦️' },
  55: { label: 'Heavy Drizzle',   emoji: '🌧️' },
  61: { label: 'Light Rain',      emoji: '🌧️' },
  63: { label: 'Rain',            emoji: '🌧️' },
  65: { label: 'Heavy Rain',      emoji: '🌧️' },
  71: { label: 'Light Snow',      emoji: '🌨️' },
  73: { label: 'Snow',            emoji: '❄️'  },
  75: { label: 'Heavy Snow',      emoji: '❄️'  },
  77: { label: 'Snow Grains',     emoji: '🌨️' },
  80: { label: 'Rain Showers',    emoji: '🌦️' },
  81: { label: 'Rain Showers',    emoji: '🌧️' },
  82: { label: 'Heavy Showers',   emoji: '⛈️'  },
  85: { label: 'Snow Showers',    emoji: '🌨️' },
  86: { label: 'Heavy Snow',      emoji: '❄️'  },
  95: { label: 'Thunderstorm',    emoji: '⛈️'  },
  96: { label: 'Thunderstorm',    emoji: '⛈️'  },
  99: { label: 'Thunderstorm',    emoji: '⛈️'  },
};

@Component({
  selector: 'app-stadium-map',
  templateUrl: './stadium-map.component.html',
  styleUrl: './stadium-map.component.scss',
  standalone: false
})
export class StadiumMapComponent implements OnInit, AfterViewInit, OnDestroy {

  stadiums: Stadium[] = [
    { team: 'Arizona Diamondbacks', abbr: 'ARI', name: 'Chase Field',                  address: '401 E Jefferson St, Phoenix, AZ',        lat: 33.4453, lng: -112.0667 },
    { team: 'Atlanta Braves',        abbr: 'ATL', name: 'Truist Park',                   address: '755 Battery Ave SE, Atlanta, GA',         lat: 33.8908, lng: -84.4678  },
    { team: 'Baltimore Orioles',     abbr: 'BAL', name: 'Oriole Park at Camden Yards',   address: '333 W Camden St, Baltimore, MD',          lat: 39.2838, lng: -76.6217  },
    { team: 'Boston Red Sox',        abbr: 'BOS', name: 'Fenway Park',                   address: '4 Jersey St, Boston, MA',                lat: 42.3467, lng: -71.0972  },
    { team: 'Chicago Cubs',          abbr: 'CHC', name: 'Wrigley Field',                 address: '1060 W Addison St, Chicago, IL',          lat: 41.9484, lng: -87.6553  },
    { team: 'Chicago White Sox',     abbr: 'CHW', name: 'Rate Field',                    address: '333 W 35th St, Chicago, IL',              lat: 41.8299, lng: -87.6338  },
    { team: 'Cincinnati Reds',       abbr: 'CIN', name: 'Great American Ball Park',      address: '100 Joe Nuxhall Way, Cincinnati, OH',     lat: 39.0979, lng: -84.5082  },
    { team: 'Cleveland Guardians',   abbr: 'CLE', name: 'Progressive Field',             address: '2401 Ontario St, Cleveland, OH',          lat: 41.4962, lng: -81.6852  },
    { team: 'Colorado Rockies',      abbr: 'COL', name: 'Coors Field',                   address: '2001 Blake St, Denver, CO',               lat: 39.7559, lng: -104.9942 },
    { team: 'Detroit Tigers',        abbr: 'DET', name: 'Comerica Park',                 address: '2100 Woodward Ave, Detroit, MI',          lat: 42.3390, lng: -83.0485  },
    { team: 'Houston Astros',        abbr: 'HOU', name: 'Daikin Park',                   address: '501 Crawford St, Houston, TX',            lat: 29.7573, lng: -95.3555  },
    { team: 'Kansas City Royals',    abbr: 'KC',  name: 'Kauffman Stadium',              address: '1 Royal Way, Kansas City, MO',            lat: 39.0517, lng: -94.4803  },
    { team: 'Los Angeles Angels',    abbr: 'LAA', name: 'Angel Stadium',                 address: '2000 E Gene Autry Way, Anaheim, CA',      lat: 33.8003, lng: -117.8827 },
    { team: 'Los Angeles Dodgers',   abbr: 'LAD', name: 'Dodger Stadium',               address: '1000 Vin Scully Ave, Los Angeles, CA',    lat: 34.0739, lng: -118.2400 },
    { team: 'Miami Marlins',         abbr: 'MIA', name: 'LoanDepot Park',                address: '501 Marlins Way, Miami, FL',              lat: 25.7781, lng: -80.2197  },
    { team: 'Milwaukee Brewers',     abbr: 'MIL', name: 'American Family Field',         address: '1 Brewers Way, Milwaukee, WI',            lat: 43.0281, lng: -87.9712  },
    { team: 'Minnesota Twins',       abbr: 'MIN', name: 'Target Field',                  address: '1 Twins Way, Minneapolis, MN',            lat: 44.9817, lng: -93.2781  },
    { team: 'New York Mets',         abbr: 'NYM', name: 'Citi Field',                    address: '41 Seaver Way, Queens, NY',               lat: 40.7571, lng: -73.8458  },
    { team: 'New York Yankees',      abbr: 'NYY', name: 'Yankee Stadium',                address: '1 E 161 St, Bronx, NY',                   lat: 40.8296, lng: -73.9262  },
    { team: 'Athletics',             abbr: 'OAK', name: 'Sutter Health Park',            address: '400 Ballpark Dr, West Sacramento, CA',    lat: 38.5803, lng: -121.5087 },
    { team: 'Philadelphia Phillies', abbr: 'PHI', name: 'Citizens Bank Park',            address: '1 Citizens Bank Way, Philadelphia, PA',   lat: 39.9061, lng: -75.1665  },
    { team: 'Pittsburgh Pirates',    abbr: 'PIT', name: 'PNC Park',                      address: '115 Federal St, Pittsburgh, PA',          lat: 40.4469, lng: -80.0057  },
    { team: 'San Diego Padres',      abbr: 'SD',  name: 'Petco Park',                    address: '100 Park Blvd, San Diego, CA',            lat: 32.7073, lng: -117.1566 },
    { team: 'San Francisco Giants',  abbr: 'SF',  name: 'Oracle Park',                   address: '24 Willie Mays Plaza, San Francisco, CA', lat: 37.7786, lng: -122.3893 },
    { team: 'Seattle Mariners',      abbr: 'SEA', name: 'T-Mobile Park',                 address: '1250 1st Ave S, Seattle, WA',             lat: 47.5914, lng: -122.3325 },
    { team: 'St. Louis Cardinals',   abbr: 'STL', name: 'Busch Stadium',                 address: '700 Clark Ave, St. Louis, MO',            lat: 38.6226, lng: -90.1928  },
    { team: 'Tampa Bay Rays',        abbr: 'TB',  name: 'George M. Steinbrenner Field',  address: '1 Steinbrenner Dr, Tampa, FL',            lat: 27.9683, lng: -82.5036  },
    { team: 'Texas Rangers',         abbr: 'TEX', name: 'Globe Life Field',              address: '734 Stadium Dr, Arlington, TX',           lat: 32.7473, lng: -97.0828  },
    { team: 'Toronto Blue Jays',     abbr: 'TOR', name: 'Rogers Centre',                 address: '1 Blue Jays Way, Toronto, ON',            lat: 43.6414, lng: -79.3894  },
    { team: 'Washington Nationals',  abbr: 'WSH', name: 'Nationals Park',                address: '1500 S Capitol St SE, Washington, DC',    lat: 38.8730, lng: -77.0074  },
  ];

  selectedStadium: Stadium | null = null;
  radarOpacity = 0.6;
  showRadar = true;
  useCelsius = false;
  loadingWeather = false;
  weatherLoaded = false;

  private map!: L.Map;
  private radarLayer: L.TileLayer | null = null;
  private markers: L.Marker[] = [];
  private radarTimestamps: number[] = [];
  private currentTimestampIndex = 0;
  private animationInterval: any = null;
  isAnimating = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      setTimeout(() => this.initMap(), 100);
    });
  }

  ngOnDestroy() {
    this.stopAnimation();
    if (this.map) this.map.remove();
  }

  private initMap() {
    // Fix Leaflet default icon paths (broken by webpack)
    const iconDefault = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = iconDefault;

    this.map = L.map('stadium-map', {
      center: [38.5, -96],
      zoom: 4,
      zoomControl: true,
    });

    // Dark-styled OpenStreetMap tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.addStadiumMarkers();
    this.loadRadar();
    this.loadAllWeather();
  }

  private addStadiumMarkers() {
    this.stadiums.forEach(stadium => {
      const marker = L.marker([stadium.lat, stadium.lng], {
        icon: this.createStadiumIcon(stadium)
      });

      marker.on('click', () => {
        this.zone.run(() => {
          this.selectedStadium = stadium;
          this.cdr.detectChanges();
        });
      });

      marker.addTo(this.map);
      this.markers.push(marker);
    });
  }

  private createStadiumIcon(stadium: Stadium): L.DivIcon {
    return L.divIcon({
      html: `
        <div class="stadium-pin">
          <div class="pin-inner">
            <span class="pin-abbr">${stadium.abbr}</span>
          </div>
          <div class="pin-tail"></div>
        </div>
      `,
      className: '',
      iconSize: [44, 52],
      iconAnchor: [22, 52],
      popupAnchor: [0, -54]
    });
  }

  private updateMarkerIcon(stadium: Stadium) {
    const idx = this.stadiums.indexOf(stadium);
    if (idx >= 0 && this.markers[idx]) {
      this.markers[idx].setIcon(this.createStadiumIcon(stadium));
    }
  }

  // ── Radar ───────────────────────────────────────────────────────────────────
  loadRadar() {
    this.http.get<any>('https://api.rainviewer.com/public/weather-maps.json').subscribe({
      next: (data) => {
        const frames: any[] = data?.radar?.past ?? [];
        this.radarTimestamps = frames.map((f: any) => f.time);
        this.currentTimestampIndex = this.radarTimestamps.length - 1;
        this.zone.runOutsideAngular(() => this.applyRadarFrame());
      },
      error: () => {} // fail silently — map still works without radar
    });
  }

  private applyRadarFrame() {
    if (!this.radarTimestamps.length) return;
    const ts = this.radarTimestamps[this.currentTimestampIndex];
    if (this.radarLayer) {
      this.map.removeLayer(this.radarLayer);
      this.radarLayer = null;
    }
    if (!this.showRadar) return;
    this.radarLayer = L.tileLayer(
      `https://tilecache.rainviewer.com/v2/radar/${ts}/512/{z}/{x}/{y}/2/1_1.png`,
      { opacity: this.radarOpacity, zIndex: 10 }
    );
    this.radarLayer.addTo(this.map);
  }

  toggleRadar() {
    this.showRadar = !this.showRadar;
    this.zone.runOutsideAngular(() => this.applyRadarFrame());
  }

  onOpacityChange(val: string) {
    this.radarOpacity = parseFloat(val);
    if (this.radarLayer) this.radarLayer.setOpacity(this.radarOpacity);
  }

  toggleAnimation() {
    if (this.isAnimating) { this.stopAnimation(); return; }
    this.isAnimating = true;
    this.animationInterval = setInterval(() => {
      this.currentTimestampIndex =
        (this.currentTimestampIndex + 1) % this.radarTimestamps.length;
      this.zone.runOutsideAngular(() => this.applyRadarFrame());
    }, 600);
  }

  stopAnimation() {
    this.isAnimating = false;
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    // Snap back to latest frame
    this.currentTimestampIndex = this.radarTimestamps.length - 1;
    this.zone.runOutsideAngular(() => this.applyRadarFrame());
  }

  // ── Weather ─────────────────────────────────────────────────────────────────
  loadAllWeather() {
    this.loadingWeather = true;

    // Open-Meteo allows up to ~10 locations per request but we batch all 30
    // by firing 30 lightweight parallel requests (each is tiny JSON)
    const requests = this.stadiums.map(s =>
      this.http.get<any>(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${s.lat}&longitude=${s.lng}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,` +
        `wind_speed_10m,wind_direction_10m,is_day` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm&timezone=auto`
      )
    );

    forkJoin(requests).subscribe({
      next: (responses) => {
        this.zone.run(() => {
          responses.forEach((res, i) => {
            const c = res.current;
            const wmo = WMO_CODES[c.weather_code] ?? { label: 'Unknown', emoji: '❓' };
            this.stadiums[i].weather = {
              temp:          Math.round(c.temperature_2m),
              tempC:         Math.round((c.temperature_2m - 32) * 5 / 9),
              condition:     wmo.label,
              windSpeed:     Math.round(c.wind_speed_10m),
              windDir:       c.wind_direction_10m,
              precipitation: c.precipitation,
              humidity:      c.relative_humidity_2m,
              icon:          wmo.emoji,
              isDay:         c.is_day === 1,
            };
            this.updateMarkerIcon(this.stadiums[i]);
          });
          this.loadingWeather = false;
          this.weatherLoaded = true;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone.run(() => {
          this.loadingWeather = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  flyToStadium(stadium: Stadium) {
    this.selectedStadium = stadium;
    this.zone.runOutsideAngular(() => {
      this.map.flyTo([stadium.lat, stadium.lng], 13, { duration: 1.2 });
    });
  }

  closePanel() {
    this.selectedStadium = null;
  }

  windDirectionLabel(deg: number): string {
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  displayTemp(w: StadiumWeather): string {
    return this.useCelsius ? `${w.tempC}°C` : `${w.temp}°F`;
  }

  getPrecipClass(mm: number): string {
    if (mm === 0) return 'precip-none';
    if (mm < 2)   return 'precip-light';
    if (mm < 10)  return 'precip-moderate';
    return 'precip-heavy';
  }

  get sortedByCondition(): Stadium[] {
    return [...this.stadiums].sort((a, b) => {
      const pa = a.weather?.precipitation ?? 0;
      const pb = b.weather?.precipitation ?? 0;
      return pb - pa;
    });
  }
}
