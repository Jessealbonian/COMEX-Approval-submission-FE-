import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TopnavStaffComponent } from '../../components/topnav-staff/topnav-staff.component';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';
import { MenuService, Product } from '../../services/menu.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, TopnavStaffComponent, SidenavComponent],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.css',
})
export class MenuComponent implements OnInit {
  products: Product[] = [];
  archivedProducts: Product[] = [];
  filteredProducts: Product[] = [];
  filteredArchivedProducts: Product[] = [];
  showArchived: boolean = false;
  sortBy: string = 'date';
  selectedCategories: string[] = [];
  searchQuery: string = '';
  showAddModal: boolean = false;
  showEditModal: boolean = false;
  newProduct: Partial<Product> = {
    name: '',
    price: 0,
    image: '',
    category: '',
    stock: 0,
  };
  editProduct: Partial<Product> = {};
  selectedEditId: number | null = null;
  categories: string[] = ['Rice Meals', 'Drinks', 'Sandwiches', 'Snacks'];
  newSubcategories: string[] = [];
  editSubcategories: string[] = [];
  newProductSubcategory: string | undefined = undefined;
  editProductSubcategory: string | undefined = undefined;
  selectedFileName: string = '';
  private uploadedImageDataUrl: string = '';
  selectedEditFileName: string = '';
  private uploadedEditImageDataUrl: string = '';
  loading: boolean = false;
  error: string = '';

  constructor(public menuService: MenuService, private router: Router) {}

  // Compress image to reduce size
  private compressImage(
    dataUrl: string,
    maxWidth: number = 600
  ): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        // Further reduce size for very large images
        if (width > 400) {
          const scale = 400 / width;
          width = 400;
          height = height * scale;
        }

        canvas.width = width;
        canvas.height = height;

        if (ctx) {
          // Enable image smoothing for better quality
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          ctx.drawImage(img, 0, 0, width, height);

          // Detect transparency by scanning alpha channel
          let hasTransparency = false;
          try {
            const imageData = ctx.getImageData(0, 0, width, height).data;
            for (let i = 3; i < imageData.length; i += 4) {
              if (imageData[i] < 255) {
                // alpha channel
                hasTransparency = true;
                break;
              }
            }
          } catch (_) {
            // getImageData can fail due to tainted canvas; fallback to original mime
            hasTransparency =
              dataUrl.startsWith('data:image/png') ||
              dataUrl.startsWith('data:image/webp');
          }

          // If transparency detected, keep PNG to preserve alpha; otherwise use JPEG
          if (hasTransparency) {
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          }
        } else {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    });
  }

  ngOnInit() {
    // Check authentication status silently
    const isAuthenticated = !!this.menuService['authService'].getToken('staff');
    if (!isAuthenticated) {
      console.warn('User not authenticated - redirecting to login');
    }

    this.loadProducts();
    this.loadCategories();
    this.refreshInventoryLogs();
  }

  private loadNewSubcategoriesFor(category: string) {
    this.newSubcategories = [];
    if (!category) return;
    this.menuService.getSubcategories(category).subscribe({
      next: (subs) => (this.newSubcategories = subs || []),
      error: () => (this.newSubcategories = []),
    });
  }

  private loadEditSubcategoriesFor(category: string) {
    this.editSubcategories = [];
    if (!category) return;
    this.menuService.getSubcategories(category).subscribe({
      next: (subs) => (this.editSubcategories = subs || []),
      error: () => (this.editSubcategories = []),
    });
  }

  loadProducts() {
    this.loading = true;
    this.error = '';
    this.menuService.getProducts().subscribe({
      next: (products) => {
        this.products = products;
        this.applyFiltersAndSort();
        this.loading = false;
        this.error = '';
        this.broadcastMenuBadge();
      },
      error: (error) => {
        console.error('Error loading products:', error);
        this.error = 'Failed to load products';
        this.loading = false;
      },
    });

    // Load archived products if showing archived
    if (this.showArchived) {
      this.loadArchivedProducts();
    }
  }

  loadArchivedProducts() {
    this.loading = true;
    this.menuService.getArchivedProducts().subscribe({
      next: (products) => {
        this.archivedProducts = products;
        this.applyFiltersAndSort();
        this.loading = false;
        this.error = '';
      },
      error: (error) => {
        console.error('Error loading archived products:', error);
        this.error = 'Failed to load archived products. Please try again.';
        this.loading = false;
      },
    });
  }

  toggleInventoryView() {
    this.router.navigate(['/staff/inventory']);
  }

  private refreshInventoryLogs() {
    this.menuService.getInventoryLogs().subscribe({
      error: (error) =>
        console.error('Error refreshing inventory logs:', error),
    });
  }

  // Toggle category selection
  toggleCategory(category: string) {
    const index = this.selectedCategories.indexOf(category);
    if (index > -1) {
      this.selectedCategories.splice(index, 1);
    } else {
      this.selectedCategories.push(category);
    }
    this.applyFiltersAndSort();
  }

  // Check if a category is selected
  isCategorySelected(category: string): boolean {
    return this.selectedCategories.includes(category);
  }

  // Clear all filters
  clearFilters() {
    this.selectedCategories = [];
    this.applyFiltersAndSort();
  }

  // Apply filters and sorting
  applyFiltersAndSort() {
    // Filter products
    let filtered = this.showArchived
      ? [...this.archivedProducts]
      : [...this.products];

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query) ||
          product.price.toString().includes(query)
      );
    }

    // Apply category filter
    if (this.selectedCategories.length > 0) {
      filtered = filtered.filter((product) =>
        this.selectedCategories.includes(product.category)
      );
    }

    // Apply sorting
    filtered = this.applySorting(filtered);

    // Update filtered arrays
    if (this.showArchived) {
      this.filteredArchivedProducts = filtered;
    } else {
      this.filteredProducts = filtered;
    }
  }

  // Handle search input change
  onSearchChange() {
    this.applyFiltersAndSort();
  }

  // Clear search
  clearSearch() {
    this.searchQuery = '';
    this.applyFiltersAndSort();
  }

  // Check if product has low stock
  isLowStock(stock: number): boolean {
    return stock <= 10; // Consider stock low if 10 or less
  }

  // Apply sorting logic
  private applySorting(products: Product[]): Product[] {
    const sorted = [...products];

    switch (this.sortBy) {
      case 'date':
        // Newest first (by ID)
        return sorted.sort((a, b) => b.id - a.id);

      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));

      case 'price-low-high':
        return sorted.sort((a, b) => a.price - b.price);

      case 'price-high-low':
        return sorted.sort((a, b) => b.price - a.price);

      case 'stock':
        // Highest stock first
        return sorted.sort((a, b) => b.stock - a.stock);

      case 'popular':
      case 'relevance':
        // Sort by stock (items with lower stock are more popular/relevant as they're being bought more)
        // Combined with price (cheaper items tend to be more popular)
        return sorted.sort((a, b) => {
          // Calculate popularity score: lower stock and reasonable price = more popular
          const scoreA = 100 - a.stock + 100 / (a.price + 1);
          const scoreB = 100 - b.stock + 100 / (b.price + 1);
          return scoreB - scoreA;
        });

      default:
        return sorted;
    }
  }

  toggleArchived() {
    this.showArchived = !this.showArchived;
    if (this.showArchived) {
      this.loadArchivedProducts();
    } else {
      this.applyFiltersAndSort();
    }
  }

  unarchiveProduct(id: number) {
    // Find the product to get its name for the confirmation message
    const product = this.archivedProducts.find((p) => p.id === id);
    const productName = product ? product.name : 'this product';

    // Show confirmation dialog
    Swal.fire({
      title: 'Confirm Restore',
      text: `Are you sure you want to restore "${productName}" to the active menu?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      cancelButtonText: 'Cancel',
      confirmButtonText: 'Yes, restore it!',
      reverseButtons: true,
    }).then((result) => {
      if (result.isConfirmed) {
        // Proceed with unarchiving
        this.loading = true;
        this.menuService.unarchiveProduct(id).subscribe({
          next: () => {
            this.loadProducts();
            if (this.showArchived) {
              this.loadArchivedProducts();
            }
            this.error = '';
            this.loading = false;
            // Show success message
            Swal.fire(
              'Product Restored!',
              `"${productName}" has been successfully restored to the active menu.`,
              'success'
            );
          },
          error: (error) => {
            console.error('Error unarchiving product:', error);
            this.error = 'Failed to unarchive product. Please try again.';
            this.loading = false;
            // Show error message
            Swal.fire(
              'Error!',
              'Failed to restore product. Please try again.',
              'error'
            );
          },
        });
      }
    });
  }

  loadCategories() {
    this.menuService.getCategories().subscribe({
      next: (categories) => {
        if (categories.length > 0) {
          this.categories = categories;
        }
      },
      error: (error) => {
        console.error('Error loading categories:', error);
        // Keep default categories if API fails
      },
    });
  }

  onNewCategoryChange(value: string) {
    this.newProductSubcategory = undefined;
    this.loadNewSubcategoriesFor(value);
  }

  onEditCategoryChange(value: string) {
    this.editProductSubcategory = undefined;
    this.loadEditSubcategoriesFor(value);
  }

  openAddModal() {
    this.showAddModal = true;
    this.newProduct = { name: '', price: 0, image: '', category: '', stock: 0 };
    this.newSubcategories = [];
    this.newProductSubcategory = undefined;
  }

  closeAddModal() {
    this.showAddModal = false;
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Check file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.error = 'Image file size must be less than 5MB';
        return;
      }

      // Warn about large files that might cause issues
      if (file.size > 2 * 1024 * 1024) {
        this.error =
          'Warning: Large image file detected. It will be compressed automatically.';
        setTimeout(() => (this.error = ''), 3000); // Clear warning after 3 seconds
      }

      this.selectedFileName = file.name;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.uploadedImageDataUrl = e.target.result;
        this.error = ''; // Clear any previous errors
      };
      reader.readAsDataURL(file);
    } else {
      this.selectedFileName = '';
      this.uploadedImageDataUrl = '';
    }
  }

  async addProduct() {
    if (!this.newProduct.name || !this.newProduct.category) return;

    // Check if user is authenticated
    if (!this.menuService['authService'].getToken('staff')) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'You must be logged in to add products. Please log in again.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#d33',
      });
      return;
    }

    // Close the modal first so SweetAlert can be seen
    this.closeAddModal();

    // Show confirmation dialog
    Swal.fire({
      title: 'Add New Product',
      text: `Are you sure you want to add "${this.newProduct.name}" to the menu?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, add it!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Adding Product...',
          text: 'Please wait while we add the product to the menu.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        this.addProductToDatabase();
      } else {
        // If user cancels, reopen the modal
        this.openAddModal();
      }
    });
  }

  private async addProductToDatabase() {
    try {
      this.loading = true;
      this.error = '';

      // Compress image if one is uploaded
      let finalImage =
        this.uploadedImageDataUrl ||
        this.newProduct.image ||
        'https://via.placeholder.com/100';
      if (this.uploadedImageDataUrl) {
        finalImage = await this.compressImage(this.uploadedImageDataUrl);
      }

      const productData = {
        name: this.newProduct.name!,
        price: Number(this.newProduct.price),
        image: finalImage,
        category: this.newProduct.category!,
        subcategory: this.newProductSubcategory,
        stock: Number(this.newProduct.stock),
      };

      this.menuService.addProduct(productData).subscribe({
        next: (newProduct) => {
          this.products.unshift(newProduct); // Add to beginning to show newest first
          this.closeAddModal();
          this.selectedFileName = '';
          this.uploadedImageDataUrl = '';
          this.error = '';
          this.loading = false;
          this.broadcastMenuBadge();

          Swal.fire({
            icon: 'success',
            title: 'Product Added!',
            text: `"${newProduct.name}" has been successfully added to the menu.`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#52796f',
          });

          this.refreshInventoryLogs();
        },
        error: (error) => {
          console.error('Error adding product:', error);
          this.loading = false;

          if (error.status === 401) {
            Swal.fire({
              icon: 'error',
              title: 'Authentication Failed',
              text: 'Please log in again to add products.',
              confirmButtonText: 'OK',
              confirmButtonColor: '#52796f',
            });
          } else {
            Swal.fire({
              icon: 'error',
              title: 'Add Product Failed',
              text: 'Failed to add product. Please try again.',
              confirmButtonText: 'OK',
              confirmButtonColor: '#52796f',
            });
          }
        },
      });
    } catch (error) {
      console.error('Error processing image:', error);
      this.loading = false;

      Swal.fire({
        icon: 'error',
        title: 'Image Processing Error',
        text: 'Error processing image. Please try again.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#d33',
      });
    }
  }

  deleteProduct(id: number) {
    // Check if user is authenticated
    if (!this.menuService['authService'].getToken('staff')) {
      this.error =
        'You must be logged in to delete products. Please log in again.';
      return;
    }

    // Find the product to get its name for the confirmation message
    const product = this.products.find((p) => p.id === id);
    const productName = product ? product.name : 'this product';

    // Show confirmation dialog
    Swal.fire({
      title: 'Confirm Archive',
      text: `Are you sure you want to archive "${productName}"?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      cancelButtonText: 'Cancel',
      confirmButtonText: 'Yes, archive it!',
      reverseButtons: true,
    }).then((result) => {
      if (result.isConfirmed) {
        // Proceed with archiving
        this.menuService.deleteProduct(id).subscribe({
          next: () => {
            this.products = this.products.filter((p) => p.id !== id);
            this.error = '';
            this.broadcastMenuBadge();
            // Show success message
            Swal.fire(
              'Product Archived!',
              `"${productName}" has been successfully archived.`,
              'success'
            );
          },
          error: (error) => {
            console.error('Error archiving product:', error);
            if (error.status === 401) {
              this.error = 'Authentication failed. Please log in again.';
              Swal.fire(
                'Authentication Error!',
                'Please log in again to archive products.',
                'error'
              );
            } else {
              this.error = 'Failed to archive product';
              Swal.fire(
                'Error!',
                'Failed to archive product. Please try again.',
                'error'
              );
            }
          },
        });
      }
    });
  }

  onSortChange(value: string) {
    this.sortBy = value;
    this.applyFiltersAndSort();
  }

  openEditModal(product: Product) {
    this.showEditModal = true;
    this.selectedEditId = product.id;
    this.editProduct = { ...product };
    this.selectedEditFileName = '';
    this.uploadedEditImageDataUrl = '';
    this.loadEditSubcategoriesFor(product.category);
    this.editProductSubcategory = product.subcategory || undefined;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.selectedEditId = null;
    this.editProduct = {};
    this.selectedEditFileName = '';
    this.uploadedEditImageDataUrl = '';
  }

  reopenEditModal(
    productData: Partial<Product>,
    editId: number,
    uploadedImage?: string
  ) {
    this.showEditModal = true;
    this.selectedEditId = editId;
    this.editProduct = { ...productData };
    this.selectedEditFileName = '';
    this.uploadedEditImageDataUrl = uploadedImage || '';
  }

  onEditFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Check file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.error = 'Image file size must be less than 5MB';
        return;
      }

      // Warn about large files that might cause issues
      if (file.size > 2 * 1024 * 1024) {
        this.error =
          'Warning: Large image file detected. It will be compressed automatically.';
        setTimeout(() => (this.error = ''), 3000); // Clear warning after 3 seconds
      }

      this.selectedEditFileName = file.name;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.uploadedEditImageDataUrl = e.target.result;
        this.error = ''; // Clear any previous errors
      };
      reader.readAsDataURL(file);
    } else {
      this.selectedEditFileName = '';
      this.uploadedEditImageDataUrl = '';
    }
  }

  async updateProduct() {
    if (
      !this.editProduct.name ||
      !this.editProduct.category ||
      this.selectedEditId === null
    ) {
      console.error('Missing required fields for product update:', {
        name: this.editProduct.name,
        category: this.editProduct.category,
        selectedEditId: this.selectedEditId,
      });
      Swal.fire({
        icon: 'error',
        title: 'Missing Information',
        text: 'Please fill in all required fields before updating the product.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#d33',
      });
      return;
    }

    // Check if user is authenticated
    if (!this.menuService['authService'].getToken('staff')) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'You must be logged in to update products. Please log in again.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#d33',
      });
      return;
    }

    // Store the product data and uploaded image before closing modal
    const productToUpdate = { ...this.editProduct };
    const editId = this.selectedEditId;
    const uploadedImage = this.uploadedEditImageDataUrl;

    // Close the modal first so SweetAlert can be seen
    this.closeEditModal();

    // Show confirmation dialog
    Swal.fire({
      title: 'Update Product',
      text: `Are you sure you want to update "${productToUpdate.name}"?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, update it!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Updating Product...',
          text: 'Please wait while we update the product.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        this.updateProductInDatabaseWithData(
          productToUpdate,
          editId,
          uploadedImage
        );
      } else {
        // If user cancels, reopen the modal with the original data
        this.reopenEditModal(productToUpdate, editId, uploadedImage);
      }
    });
  }

  private async updateProductInDatabaseWithData(
    productData: Partial<Product>,
    editId: number,
    uploadedImage?: string
  ) {
    try {
      this.loading = true;
      this.error = '';

      // Double-check that editId is valid
      if (!editId || editId === null) {
        console.error('editId is null or undefined:', editId);
        this.loading = false;
        Swal.fire({
          icon: 'error',
          title: 'Update Error',
          text: 'Product ID is missing. Please try editing the product again.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#d33',
        });
        return;
      }

      // Compress image if one is uploaded
      let finalImage =
        uploadedImage || productData.image || 'https://via.placeholder.com/100';
      if (uploadedImage) {
        console.log('Compressing uploaded image...');
        finalImage = await this.compressImage(uploadedImage);
        console.log('Image compressed, length:', finalImage.length);
      } else {
        console.log('No new image uploaded, using existing image');
      }

      const updateData = {
        name: productData.name,
        price: Number(productData.price),
        image: finalImage,
        category: productData.category,
        subcategory: this.editProductSubcategory,
        stock: Number(productData.stock),
      };

      console.log('Updating product with data:', updateData);
      console.log('Product ID:', editId);

      this.menuService.updateProduct(editId, updateData).subscribe({
        next: (updatedProduct) => {
          console.log('Product updated successfully:', updatedProduct);
          const idx = this.products.findIndex((p) => p.id === editId);
          console.log('Found product at index:', idx);
          if (idx !== -1) {
            this.products[idx] = updatedProduct;
            console.log('Product updated in array:', this.products[idx]);
            // Force change detection by creating a new array reference
            this.products = [...this.products];
          }
          this.closeEditModal();
          this.error = '';
          this.loading = false;
          this.broadcastMenuBadge();

          Swal.fire({
            icon: 'success',
            title: 'Product Updated!',
            text: `"${updatedProduct.name}" has been successfully updated.`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#52796f',
          });

          this.refreshInventoryLogs();
        },
        error: (error) => {
          console.error('Error updating product:', error);
          this.loading = false;

          if (error.status === 401) {
            Swal.fire({
              icon: 'error',
              title: 'Authentication Failed',
              text: 'Please log in again to update products.',
              confirmButtonText: 'OK',
              confirmButtonColor: '#52796f',
            });
          } else {
            Swal.fire({
              icon: 'error',
              title: 'Update Failed',
              text: 'Failed to update product. Please try again.',
              confirmButtonText: 'OK',
              confirmButtonColor: '#52796f',
            });
          }
        },
      });
    } catch (error) {
      console.error('Error processing image:', error);
      this.loading = false;

      Swal.fire({
        icon: 'error',
        title: 'Image Processing Error',
        text: 'Error processing image. Please try again.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#d33',
      });
    }
  }
  toggleProductVisibility(product: Product) {
    // Check if user is authenticated
    if (!this.menuService['authService'].getToken('staff')) {
      this.error =
        'You must be logged in to toggle product visibility. Please log in again.';
      return;
    }

    const newVisibility = !(product.is_visible !== false);
    const action = newVisibility ? 'show' : 'hide';

    this.menuService.toggleProductVisibility(product.id, newVisibility).subscribe({
      next: (updatedProduct) => {
        // Update the product in the local array
        const idx = this.products.findIndex((p) => p.id === product.id);
        if (idx !== -1) {
          this.products[idx] = updatedProduct;
          this.applyFiltersAndSort();
        }
        this.error = '';
      },
      error: (error) => {
        console.error('Error toggling product visibility:', error);
        if (error.status === 401) {
          this.error = 'Authentication failed. Please log in again.';
          Swal.fire(
            'Authentication Error!',
            'Please log in again to toggle product visibility.',
            'error'
          );
        } else {
          this.error = `Failed to ${action} product`;
          Swal.fire(
            'Error!',
            `Failed to ${action} product. Please try again.`,
            'error'
          );
        }
      },
    });
  }

  private broadcastMenuBadge(): void {
    const productsList = Array.isArray(this.products) ? this.products : [];
    const lowStockCount = productsList.filter((product) =>
      this.isLowStock(Number(product?.stock ?? 0))
    ).length;

    window.dispatchEvent(
      new CustomEvent('staff-menu-updated', {
        detail: { lowStockCount },
      })
    );
  }
}
