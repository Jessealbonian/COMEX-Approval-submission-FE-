import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, interval } from 'rxjs';
import { map, catchError, startWith, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ViewsService {
  private apiUrl = `${environment.apiUrl}/views`;
  private viewCountSubject = new BehaviorSubject<number>(0);
  public viewCount$ = this.viewCountSubject.asObservable();

  constructor(private http: HttpClient) {
    // Start polling for view count updates every 30 seconds
    interval(30000)
      .pipe(
        startWith(0),
        switchMap(() => this.getViewCount()),
        catchError((error) => {
          console.error('Error polling view count:', error);
          return of(null);
        })
      )
      .subscribe((count) => {
        if (count !== null) {
          this.viewCountSubject.next(count);
        }
      });
  }

  /**
   * Record a page view
   */
  recordView(): Observable<number> {
    return this.http.post<{ success: boolean; viewCount: number }>(this.apiUrl, {}).pipe(
      map((response) => {
        const count = response.viewCount;
        this.viewCountSubject.next(count);
        return count;
      }),
      catchError((error) => {
        console.error('Error recording page view:', error);
        return of(0);
      })
    );
  }

  /**
   * Get the current view count
   */
  getViewCount(): Observable<number> {
    return this.http.get<{ success: boolean; viewCount: number }>(this.apiUrl).pipe(
      map((response) => {
        const count = response.viewCount;
        this.viewCountSubject.next(count);
        return count;
      }),
      catchError((error) => {
        console.error('Error fetching view count:', error);
        return of(0);
      })
    );
  }

  /**
   * Get the current view count from the subject (synchronous)
   */
  getCurrentViewCount(): number {
    return this.viewCountSubject.value;
  }
}

