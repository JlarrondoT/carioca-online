import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService } from '../game.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.component.html',
})
export class LobbyComponent implements OnInit, OnDestroy {
  private sub = new Subscription();

  name = '';
  roomCode = '';
  busy = false;

  state$ = this.game.state$;
  roomCode$ = this.game.roomCode$;
  playerId$ = this.game.playerId$;

  constructor(private game: GameService, private router: Router) {}

  ngOnInit(): void {
    // Prefill from last session
    this.name = (localStorage.getItem('carioca:name') ?? '').trim();
    this.roomCode = (localStorage.getItem('carioca:room') ?? '').trim();

    this.sub.add(
      this.game.state$.subscribe((s) => {
        // If we already have a room state, jump straight into the game screen
        if (s?.roomCode) {
          this.router.navigateByUrl('/game');
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  canCreate(): boolean {
    return !!this.name.trim();
  }

  canJoin(): boolean {
    return !!this.name.trim() && !!this.roomCode.trim();
  }

  createRoom(): void {
    if (!this.canCreate()) return;
    this.persistInputs();
    this.busy = true;
    this.game.createRoom(this.name.trim());
  }

  joinRoom(): void {
    if (!this.canJoin()) return;
    this.persistInputs();
    this.busy = true;
    this.game.joinRoom(this.roomCode.trim().toUpperCase(), this.name.trim());
  }

  private persistInputs(): void {
    localStorage.setItem('carioca:name', this.name.trim());
    localStorage.setItem('carioca:room', this.roomCode.trim().toUpperCase());
  }
}
