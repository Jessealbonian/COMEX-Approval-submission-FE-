import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthService } from '../auth.service';
import { environment } from '../../environments/environment';

export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  category: string;
  subcategory?: string | null;
  stock: number;
  is_visible?: boolean;
}

export interface InventoryLog {
  log_id: number;
  product_id: number | null;
  product_name: string;
  action_type: string;
  quantity_change: number;
  final_stock: number | null;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private apiUrl = `${environment.apiUrl}/menu`;

  private productsSubject = new BehaviorSubject<Product[]>([]);
  private inventoryLogsSubject = new BehaviorSubject<InventoryLog[]>([]);

  products$ = this.productsSubject.asObservable();
  inventoryLogs$ = this.inventoryLogsSubject.asObservable();

  constructor(private http: HttpClient, private authService: AuthService) {}

  // Helper method to get headers with authentication token
  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken('staff');
    if (!token) {
      console.warn('No authentication token found! User may not be logged in.');
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  // Get all active products
  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.apiUrl}/products`).pipe(
      tap((products) => this.productsSubject.next(products))
    );
  }

  // Get archived products
  getArchivedProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.apiUrl}/products/archived`, {
      headers: this.getAuthHeaders(),
    });
  }

  // Unarchive a product
  unarchiveProduct(id: number): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/products/${id}/unarchive`,
      {},
      { headers: this.getAuthHeaders() }
    );
  }

  // Add new product
  addProduct(product: Omit<Product, 'id'>): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/products`, product, {
      headers: this.getAuthHeaders(),
    }).pipe(
      tap((newProduct) => {
        const current = this.productsSubject.getValue();
        this.productsSubject.next([newProduct, ...current]);
      })
    );
  }

  // Update product
  updateProduct(id: number, product: Partial<Product>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/products/${id}`, product, {
      headers: this.getAuthHeaders(),
    }).pipe(
      tap((updatedProduct) => {
        const current = this.productsSubject.getValue();
        const index = current.findIndex((p) => p.id === updatedProduct.id);
        if (index !== -1) {
          const updated = [...current];
          updated[index] = updatedProduct;
          this.productsSubject.next(updated);
        }
      })
    );
  }

  // Delete product
  deleteProduct(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/products/${id}`, {
      headers: this.getAuthHeaders(),
    }).pipe(
      tap(() => {
        const current = this.productsSubject.getValue();
        this.productsSubject.next(current.filter((product) => product.id !== id));
      })
    );
  }

  // Get categories
  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/categories`);
  }

  // Get subcategories by category name
  getSubcategories(category: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/subcategories`, {
      params: { category },
    });
  }

  getInventoryLogs(): Observable<InventoryLog[]> {
    return this.http
      .get<InventoryLog[]>(`${this.apiUrl}/inventory/logs`, {
        headers: this.getAuthHeaders(),
      })
      .pipe(tap((logs) => this.inventoryLogsSubject.next(logs)));
  }

  updateInventoryLogsCache(logs: InventoryLog[]): void {
    this.inventoryLogsSubject.next(logs);
  }

  updateProductsCache(products: Product[]): void {
    this.productsSubject.next(products);
  }

  // Toggle product visibility
  toggleProductVisibility(id: number, isVisible: boolean): Observable<Product> {
    return this.http.put<Product>(
      `${this.apiUrl}/products/${id}/visibility`,
      { is_visible: isVisible },
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap((updatedProduct) => {
        const current = this.productsSubject.getValue();
        const index = current.findIndex((p) => p.id === updatedProduct.id);
        if (index !== -1) {
          const updated = [...current];
          updated[index] = updatedProduct;
          this.productsSubject.next(updated);
        }
      })
    );
  }
}
