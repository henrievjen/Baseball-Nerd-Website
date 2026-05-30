import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ChangeDetectorRef, NgZone
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as L from 'leaflet';

export interface Stadium {
  team: string;
  abbr: string;
  teamId: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  weather?: StadiumWeather;
}

export interface StadiumWeather {
  temp: number;
  tempC: number;
  condition: string;
  windSpeed: number;
  windDir: number;
  precipitation: number;
  humidity: number;
  icon: string;
  isDay: boolean;
  hourly?: HourlyWeather[];
}

export interface HourlyWeather {
  time: string;
  dateLabel?: string;
  temp: number;
  tempC: number;
  condition: string;
  icon: string;
  precipProb: number;
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
    { team: 'Arizona Diamondbacks', abbr: 'ARI', teamId: 109, name: 'Chase Field',                  address: '401 E Jefferson St, Phoenix, AZ',        lat: 33.4453, lng: -112.0667 },
    { team: 'Atlanta Braves',        abbr: 'ATL', teamId: 144, name: 'Truist Park',                   address: '755 Battery Ave SE, Atlanta, GA',         lat: 33.8908, lng: -84.4678  },
    { team: 'Baltimore Orioles',     abbr: 'BAL', teamId: 110, name: 'Oriole Park at Camden Yards',   address: '333 W Camden St, Baltimore, MD',          lat: 39.2838, lng: -76.6217  },
    { team: 'Boston Red Sox',        abbr: 'BOS', teamId: 111, name: 'Fenway Park',                   address: '4 Jersey St, Boston, MA',                lat: 42.3467, lng: -71.0972  },
    { team: 'Chicago Cubs',          abbr: 'CHC', teamId: 112, name: 'Wrigley Field',                 address: '1060 W Addison St, Chicago, IL',          lat: 41.9484, lng: -87.6553  },
    { team: 'Chicago White Sox',     abbr: 'CHW', teamId: 145, name: 'Rate Field',                    address: '333 W 35th St, Chicago, IL',              lat: 41.8299, lng: -87.6338  },
    { team: 'Cincinnati Reds',       abbr: 'CIN', teamId: 113, name: 'Great American Ball Park',      address: '100 Joe Nuxhall Way, Cincinnati, OH',     lat: 39.0979, lng: -84.5082  },
    { team: 'Cleveland Guardians',   abbr: 'CLE', teamId: 114, name: 'Progressive Field',             address: '2401 Ontario St, Cleveland, OH',          lat: 41.4962, lng: -81.6852  },
    { team: 'Colorado Rockies',      abbr: 'COL', teamId: 115, name: 'Coors Field',                   address: '2001 Blake St, Denver, CO',               lat: 39.7559, lng: -104.9942 },
    { team: 'Detroit Tigers',        abbr: 'DET', teamId: 116, name: 'Comerica Park',                 address: '2100 Woodward Ave, Detroit, MI',          lat: 42.3390, lng: -83.0485  },
    { team: 'Houston Astros',        abbr: 'HOU', teamId: 117, name: 'Daikin Park',                   address: '501 Crawford St, Houston, TX',            lat: 29.7573, lng: -95.3555  },
    { team: 'Kansas City Royals',    abbr: 'KC',  teamId: 118, name: 'Kauffman Stadium',              address: '1 Royal Way, Kansas City, MO',            lat: 39.0517, lng: -94.4803  },
    { team: 'Los Angeles Angels',    abbr: 'LAA', teamId: 108, name: 'Angel Stadium',                 address: '2000 E Gene Autry Way, Anaheim, CA',      lat: 33.8003, lng: -117.8827 },
    { team: 'Los Angeles Dodgers',   abbr: 'LAD', teamId: 119, name: 'Dodger Stadium',               address: '1000 Vin Scully Ave, Los Angeles, CA',    lat: 34.0739, lng: -118.2400 },
    { team: 'Miami Marlins',         abbr: 'MIA', teamId: 146, name: 'LoanDepot Park',                address: '501 Marlins Way, Miami, FL',              lat: 25.7781, lng: -80.2197  },
    { team: 'Milwaukee Brewers',     abbr: 'MIL', teamId: 158, name: 'American Family Field',         address: '1 Brewers Way, Milwaukee, WI',            lat: 43.0281, lng: -87.9712  },
    { team: 'Minnesota Twins',       abbr: 'MIN', teamId: 142, name: 'Target Field',                  address: '1 Twins Way, Minneapolis, MN',            lat: 44.9817, lng: -93.2781  },
    { team: 'New York Mets',         abbr: 'NYM', teamId: 121, name: 'Citi Field',                    address: '41 Seaver Way, Queens, NY',               lat: 40.7571, lng: -73.8458  },
    { team: 'New York Yankees',      abbr: 'NYY', teamId: 147, name: 'Yankee Stadium',                address: '1 E 161 St, Bronx, NY',                   lat: 40.8296, lng: -73.9262  },
    { team: 'Athletics',             abbr: 'OAK', teamId: 133, name: 'Sutter Health Park',            address: '400 Ballpark Dr, West Sacramento, CA',    lat: 38.5803, lng: -121.5087 },
    { team: 'Philadelphia Phillies', abbr: 'PHI', teamId: 143, name: 'Citizens Bank Park',            address: '1 Citizens Bank Way, Philadelphia, PA',   lat: 39.9061, lng: -75.1665  },
    { team: 'Pittsburgh Pirates',    abbr: 'PIT', teamId: 134, name: 'PNC Park',                      address: '115 Federal St, Pittsburgh, PA',          lat: 40.4469, lng: -80.0057  },
    { team: 'San Diego Padres',      abbr: 'SD',  teamId: 135, name: 'Petco Park',                    address: '100 Park Blvd, San Diego, CA',            lat: 32.7073, lng: -117.1566 },
    { team: 'San Francisco Giants',  abbr: 'SF',  teamId: 137, name: 'Oracle Park',                   address: '24 Willie Mays Plaza, San Francisco, CA', lat: 37.7786, lng: -122.3893 },
    { team: 'Seattle Mariners',      abbr: 'SEA', teamId: 136, name: 'T-Mobile Park',                 address: '1250 1st Ave S, Seattle, WA',             lat: 47.5914, lng: -122.3325 },
    { team: 'St. Louis Cardinals',   abbr: 'STL', teamId: 138, name: 'Busch Stadium',                 address: '700 Clark Ave, St. Louis, MO',            lat: 38.6226, lng: -90.1928  },
    { team: 'Tampa Bay Rays',        abbr: 'TB',  teamId: 139, name: 'George M. Steinbrenner Field',  address: '1 Steinbrenner Dr, Tampa, FL',            lat: 27.9683, lng: -82.5036  },
    { team: 'Texas Rangers',         abbr: 'TEX', teamId: 140, name: 'Globe Life Field',              address: '734 Stadium Dr, Arlington, TX',           lat: 32.7473, lng: -97.0828  },
    { team: 'Toronto Blue Jays',     abbr: 'TOR', teamId: 141, name: 'Rogers Centre',                 address: '1 Blue Jays Way, Toronto, ON',            lat: 43.6414, lng: -79.3894  },
    { team: 'Washington Nationals',  abbr: 'WSH', teamId: 120, name: 'Nationals Park',                address: '1500 S Capitol St SE, Washington, DC',    lat: 38.8730, lng: -77.0074  },
  ];

  selectedStadium: Stadium | null = null;
  radarOpacity   = 0.7;
  showRadar      = true;
  useCelsius     = false;
  loadingWeather = false;
  weatherLoaded  = false;
  isAnimating    = false;

  // ── Replace with your Stadia Maps API key ─────────────────────────────────
  // Free at https://stadiamaps.com — no credit card, 200k tiles/month free
  private readonly STADIA_API_KEY = 'YOUR_STADIA_API_KEY';

  // RainViewer tiles only exist up to zoom 12. Above this we hide the radar
  // overlay entirely rather than showing "Zoom Level Not Supported" tiles.
  readonly RADAR_MAX_ZOOM = 12;
  radarHiddenByZoom = false;

  private map!: L.Map;
  private markers: L.Marker[] = [];
  private radarLayer: L.TileLayer | null = null;
  private radarData:   any[] = [];
  private radarTimestamps: number[] = [];
  private currentTimestampIndex = 0;
  private lastPastIndex = 0;
  private animationInterval: any = null;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => setTimeout(() => this.initMap(), 100));
  }

  ngOnDestroy() {
    this.stopAnimation();
    if (this.map) this.map.remove();
  }

  // ── Map init ─────────────────────────────────────────────────────────────
  private initMap() {
    this.map = L.map('stadium-map', {
      center:     [38.5, -96],
      zoom:       4,
      maxZoom:    20,
      zoomSnap:   1,     // prevent fractional zoom levels that can confuse tile requests
      zoomDelta:  1,
      zoomControl: true,
    });

    // Dedicated pane for radar — sits above base tiles, below markers
    this.map.createPane('radarPane');
    const rPane = this.map.getPane('radarPane');
    if (rPane) { rPane.style.zIndex = '450'; rPane.style.pointerEvents = 'none'; }

    // Stadia Maps — Alidade Smooth Dark, beautifully designed dark theme
    // Native zoom up to 20, no "Zoom Level Not Supported" tiles at any level
    const stadiaUrl = this.STADIA_API_KEY && this.STADIA_API_KEY !== 'YOUR_STADIA_API_KEY'
      ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${this.STADIA_API_KEY}`
      : 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';

    L.tileLayer(stadiaUrl, {
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 20,
      // No maxNativeZoom needed — Stadia supports all zoom levels natively
    }).addTo(this.map);

    this.addStadiumMarkers();
    this.loadRadar();
    this.loadAllWeather();

    // Hide radar automatically when zoomed beyond RainViewer's tile limit (zoom 12)
    // so the "Zoom Level Not Supported" tiles are never visible.
    this.map.on('zoomend', () => {
      const z = this.map.getZoom();
      const tooClose = z > this.RADAR_MAX_ZOOM;
      if (tooClose !== this.radarHiddenByZoom) {
        this.zone.run(() => { this.radarHiddenByZoom = tooClose; this.cdr.detectChanges(); });
        this.zone.runOutsideAngular(() => {
          if (tooClose) {
            // Remove radar tile layer entirely — no tiles fetched, no error images
            if (this.radarLayer) { this.map.removeLayer(this.radarLayer); }
          } else {
            // Restore radar when user zooms back out
            if (this.showRadar && this.radarLayer) { this.radarLayer.addTo(this.map); }
            else if (this.showRadar) { this.applyRadarFrame(); }
          }
        });
      }
    });

    setTimeout(() => this.map.invalidateSize(), 300);
  }

  // ── Markers ───────────────────────────────────────────────────────────────
  private addStadiumMarkers() {
    this.stadiums.forEach(stadium => {
      const marker = L.marker([stadium.lat, stadium.lng], {
        icon: this.createStadiumIcon(stadium),
        zIndexOffset: 100,
      });
      marker.on('click', () => {
        this.zone.run(() => { this.selectedStadium = stadium; this.cdr.detectChanges(); });
      });
      marker.addTo(this.map);
      this.markers.push(marker);
    });
  }

  private createStadiumIcon(stadium: Stadium): L.DivIcon {
    const logoUrl = `https://www.mlbstatic.com/team-logos/${stadium.teamId}.svg`;
    return L.divIcon({
      html: `
        <div class="stadium-pin">
          <div class="pin-inner">
            <img class="pin-logo" src="${logoUrl}" alt="${stadium.abbr}"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
            <span class="pin-abbr-fallback" style="display:none">${stadium.abbr}</span>
          </div>
          <div class="pin-tail"></div>
        </div>`,
      className: '',
      iconSize:   [48, 58],
      iconAnchor: [24, 58],
    });
  }

  private updateMarkerIcon(stadium: Stadium) {
    const idx = this.stadiums.indexOf(stadium);
    if (idx >= 0 && this.markers[idx]) this.markers[idx].setIcon(this.createStadiumIcon(stadium));
  }

  radarHasNoPrecip = false;

  // ── Radar ─────────────────────────────────────────────────────────────────
  loadRadar() {
    this.http.get<any>('https://api.rainviewer.com/public/weather-maps.json').subscribe({
      next: (data) => {
        // Only use PAST (observed) frames — nowcast (future prediction) frames have
        // patchy tile coverage and return "Zoom Level Not Supported" for coordinates
        // outside their forecast area, even at low zoom levels.
        const past: any[] = data?.radar?.past ?? [];

        this.radarData = past.filter(f => {
          const t = typeof f === 'object' ? f.time : f;
          return t && !isNaN(Number(t)) && Number(t) > 0;
        });

        this.radarTimestamps       = this.radarData.map(f => typeof f === 'object' ? f.time : f);
        this.lastPastIndex         = Math.max(0, this.radarData.length - 1);
        this.currentTimestampIndex = this.lastPastIndex; // start at most recent frame

        if (this.radarTimestamps.length > 0) {
          this.zone.runOutsideAngular(() => this.applyRadarFrame());
        }
      },
      error: () => {}
    });
  }

  private applyRadarFrame() {
    if (!this.map || !this.radarData.length) return;
    this.currentTimestampIndex = Math.max(0, Math.min(this.currentTimestampIndex, this.radarData.length - 1));

    if (this.radarLayer) {
      this.map.removeLayer(this.radarLayer);
      this.radarLayer = null;
    }

    if (!this.showRadar || this.radarHiddenByZoom) return;

    // Use the path property from the API response directly — it's the authoritative
    // URL path RainViewer provides for each frame. Colour scheme 2 = "Original"
    // global radar product with full worldwide tile coverage.
    const frame = this.radarData[this.currentTimestampIndex];
    const path  = frame?.path ?? `/v2/radar/${frame?.time ?? this.radarTimestamps[this.currentTimestampIndex]}`;
    const url   = `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`;

    this.radarLayer = L.tileLayer(url, {
      opacity:       this.radarOpacity,
      pane:          'radarPane',
      tileSize:      256,
      maxZoom:       20,
      maxNativeZoom: 12,  // upscale zoom-12 tiles above this; never requests zoom 13+ from RainViewer
      zIndex:        450,
      // Treat 404 responses as empty tiles rather than broken images
      errorTileUrl:  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    });
    this.radarLayer.addTo(this.map);
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
    if (!this.radarTimestamps.length) return;
    this.isAnimating = true;
    this.zone.runOutsideAngular(() => {
      this.animationInterval = setInterval(() => {
        this.currentTimestampIndex = (this.currentTimestampIndex + 1) % this.radarTimestamps.length;
        this.applyRadarFrame();
      }, 1200);
    });
  }

  stopAnimation() {
    this.isAnimating = false;
    if (this.animationInterval) { clearInterval(this.animationInterval); this.animationInterval = null; }
    this.currentTimestampIndex = Math.min(this.lastPastIndex, Math.max(0, this.radarTimestamps.length - 1));
    this.zone.runOutsideAngular(() => this.applyRadarFrame());
  }

  // ── Weather ───────────────────────────────────────────────────────────────
  loadAllWeather() {
    this.loadingWeather = true;
    const requests = this.stadiums.map(s =>
      this.http.get<any>(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${s.lat}&longitude=${s.lng}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,` +
        `wind_speed_10m,wind_direction_10m,is_day` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm&timezone=auto` +
        `&forecast_days=14`
      ).pipe(catchError(() => of(null)))
    );

    forkJoin(requests).subscribe({
      next: (responses) => {
        this.zone.run(() => {
          responses.forEach((res, i) => {
            if (!res?.current) return;
            const c   = res.current;
            const wmo = WMO_CODES[c.weather_code] ?? { label: 'Unknown', emoji: '❓' };
            const nowTs = new Date(c.time).getTime();
            const hourlyData: HourlyWeather[] = [];

            if (res.hourly?.time) {
              let start = res.hourly.time.findIndex((t: string) => new Date(t).getTime() >= nowTs);
              if (start === -1) start = 0;
              for (let j = start; j < res.hourly.time.length; j++) {
                const hw = WMO_CODES[res.hourly.weather_code[j]] ?? { label: 'Unknown', emoji: '❓' };
                const ht = new Date(res.hourly.time[j]);
                let dateLabel: string | undefined;
                if (j === start || ht.getHours() === 0)
                  dateLabel = ht.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
                hourlyData.push({
                  time: ht.toLocaleTimeString([], { hour: 'numeric' }),
                  dateLabel,
                  temp:       Math.round(res.hourly.temperature_2m[j]),
                  tempC:      Math.round((res.hourly.temperature_2m[j] - 32) * 5 / 9),
                  condition:  hw.label,
                  icon:       hw.emoji,
                  precipProb: res.hourly.precipitation_probability?.[j] ?? 0,
                });
              }
            }

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
              hourly:        hourlyData,
            };
            this.updateMarkerIcon(this.stadiums[i]);
          });
          this.loadingWeather = false;
          this.weatherLoaded  = true;
          // Check if there's any active precipitation across all stadiums
          this.radarHasNoPrecip = this.stadiums.every(s => (s.weather?.precipitation ?? 0) === 0);
          this.cdr.detectChanges();
        });
      },
      error: () => { this.zone.run(() => { this.loadingWeather = false; this.cdr.detectChanges(); }); }
    });
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  flyToStadium(stadium: Stadium) {
    this.selectedStadium = stadium;
    this.zone.runOutsideAngular(() => this.map.flyTo([stadium.lat, stadium.lng], 13, { duration: 1.2 }));
  }

  closePanel() { this.selectedStadium = null; }

  windDirectionLabel(deg: number): string {
    return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
  }

  displayTemp(w: StadiumWeather):      string { return this.useCelsius ? `${w.tempC}°C` : `${w.temp}°F`; }
  displayHourlyTemp(h: HourlyWeather): string { return this.useCelsius ? `${h.tempC}°C` : `${h.temp}°F`; }

  getPrecipClass(mm: number): string {
    if (mm === 0) return 'precip-none';
    if (mm < 2)   return 'precip-light';
    if (mm < 10)  return 'precip-moderate';
    return 'precip-heavy';
  }

  get sortedByCondition(): Stadium[] {
    return [...this.stadiums].sort((a, b) => (b.weather?.precipitation ?? 0) - (a.weather?.precipitation ?? 0));
  }
}
