import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GameService } from './game.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  connected$ = this.game.connected$;

  constructor(private game: GameService) {}

  ngOnInit(): void {
    // Keep a single socket connection across screens
    this.game.connect();
  }
}
