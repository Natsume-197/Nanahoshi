import Stripe from 'stripe';

export interface Series {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface SeriesWithCover {
  series_id: string;
  series_name: string;
  series_created_at: string;
  book_id: string;
  book_title: string;
  cover_path: string;
}

export interface BookSeries {
  series_id: string;
  book_id: string;
  book: BookWithFormats;
}

export interface SeriesWithBooks extends Series {
  book_series: BookSeries[];
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface CollectionBook {
  collection_id: string;
  book_id: string;
  added_at?: string;
}

export interface CollectionWithBooks extends Collection {
  books: Book[];
}

export interface CollectionWithBooksAndFormats extends Collection {
  collections: Collection[];
  books: BookWithFormats[];
}

export interface Book {
  id: string;
  user_id: string;
  original_title: string;   // Título original (como se ingresó en el formulario)
  original_desc: string;    // Descripción o incluso el autor, según tu diseño
  cover_path: string;       // Ruta del cover almacenado en el bucket "images"
  isbn?: string;            // Opcional, si decides almacenar el ISBN
  published_date?: string;  // Opcional, en formato "YYYY-MM-DD"
  created_at?: string;      // Fecha de creación (generalmente generada por la base de datos)
}

/**
 * Interface para representar el formato del libro (BookFormat)
 */
export interface BookFormat {
  id: string;
  book_id: string;          // Llave foránea que referencia a Book.id
  created_at?: string;      // Fecha de creación (puede ser definida automáticamente)
  format_type: "epub" | "pdf" | "audiobook" | string;  
  // Puedes definir un union type si sabes todos los formatos que soportarás o dejarlo como string.
  file_path: string;        // Ruta del archivo almacenado en el bucket correspondiente ("books" o "audiobooks")
  file_size: number;        // Tamaño del archivo en bytes
}

export interface Author {
  id: string;
  name: string;
}

export interface BookWithFormats extends Book {
  formats: BookFormat[];
  authors: Author[];
  series: BookSeries | null;
}

export interface UserDetails {
    id: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    avatar_url?: string;
    billing_address?: Stripe.Address;
    payment_method?: Stripe.PaymentMethod[Stripe.PaymentMethod.Type];
  }
  

  export interface Product {
    id: string;
    active?: boolean;
    name?: string;
    description?: string;
    image?: string;
    metadata?: Stripe.Metadata;
  }

  export interface Price {
    id: string;
    product_id?: string;
    active?: boolean;
    description?: string;
    unit_amount?: number;
    currency?: string;
    type?: Stripe.Price.Type;
    interval?: Stripe.Price.Recurring.Interval;
    interval_count?: number;
    trial_period_days?: number | null;
    metadata?: Stripe.Metadata;
    products?: Product;
  }

  export interface Subscription {
    id: string;
    user_id: string;
    status?: Stripe.Subscription.Status;
    metadata?: Stripe.Metadata;
    price_id?: string;
    quantity?: number;
    cancel_at_period_end?: boolean;
    created: string;
    current_period_start: string;
    current_period_end: string;
    ended_at?: string;
    cancel_at?: string;
    canceled_at?: string;
    trial_start?: string;
    trial_end?: string;
    prices?: Price;
  }