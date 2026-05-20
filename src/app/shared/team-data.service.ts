import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TeamDataService {
  private colors: Record<number, string> = {
    108:'#BA0021',109:'#A71930',110:'#DF4601',111:'#BD3039',112:'#0E3386',
    113:'#C6011F',114:'#E31937',115:'#333366',116:'#0C2340',117:'#EB6E1F',
    118:'#004687',119:'#005A9C',120:'#AB0003',121:'#002D72',133:'#003831',
    134:'#FDB827',135:'#2F241D',136:'#005C5C',137:'#FD5A1E',138:'#C41E3A',
    139:'#092C5C',140:'#003278',141:'#134A8E',142:'#002B5C',143:'#E81828',
    144:'#CE1141',145:'#27251F',146:'#00A3E0',147:'#003087',158:'#12284B'
  };

  private abbrs: Record<number, string> = {
    108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',
    115:'COL',116:'DET',117:'HOU',118:'KC', 119:'LAD',120:'WSH',121:'NYM',
    133:'ATH',134:'PIT',135:'SD', 136:'SEA',137:'SF', 138:'STL',139:'TB',
    140:'TEX',141:'TOR',142:'MIN',143:'PHI',144:'ATL',145:'CHW',146:'MIA',
    147:'NYY',158:'MIL'
  };

  color(id: number): string   { return this.colors[id] ?? '#C8102E'; }
  abbr(id: number): string    { return this.abbrs[id]  ?? 'MLB'; }
  logo(id: number): string    { return `https://www.mlbstatic.com/team-logos/${id}.svg`; }
  photo(id: number): string   { return `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`; }

  /** Full team-name map (id → display name) */
  private names: Record<number, string> = {
    108:'Los Angeles Angels',     109:'Arizona Diamondbacks',  110:'Baltimore Orioles',
    111:'Boston Red Sox',         112:'Chicago Cubs',          113:'Cincinnati Reds',
    114:'Cleveland Guardians',    115:'Colorado Rockies',      116:'Detroit Tigers',
    117:'Houston Astros',         118:'Kansas City Royals',    119:'Los Angeles Dodgers',
    120:'Washington Nationals',   121:'New York Mets',         133:'Athletics',
    134:'Pittsburgh Pirates',     135:'San Diego Padres',      136:'Seattle Mariners',
    137:'San Francisco Giants',   138:'St. Louis Cardinals',   139:'Tampa Bay Rays',
    140:'Texas Rangers',          141:'Toronto Blue Jays',     142:'Minnesota Twins',
    143:'Philadelphia Phillies',  144:'Atlanta Braves',        145:'Chicago White Sox',
    146:'Miami Marlins',          147:'New York Yankees',      158:'Milwaukee Brewers'
  };

  name(id: number): string    { return this.names[id] ?? ''; }

  /** All MLB teams sorted alphabetically by full name (for filter dropdowns) */
  allTeams(): Array<{ id: number; name: string; abbr: string }> {
    return Object.keys(this.names)
      .map(k => Number(k))
      .map(id => ({ id, name: this.names[id], abbr: this.abbrs[id] ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
