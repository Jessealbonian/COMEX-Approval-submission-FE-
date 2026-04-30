import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-login',
  imports: [NgOptimizedImage],
  templateUrl: './login.html',
  styleUrl: './login.css',
  host: {
    class: 'login-page',
  },
})
export class Login {

}
