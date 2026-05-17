import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private _openPlayer$ = new Subject<number>();
  openPlayer$ = this._openPlayer$.asObservable();

  openPlayer(id: number) { this._openPlayer$.next(id); }
}
