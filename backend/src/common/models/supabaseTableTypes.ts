import type { Database } from './supabaseTypes';

export type Library = Database['public']['Tables']['library']['Row'];
export type LibraryPath = Database['public']['Tables']['library_path']['Row'];

export interface LibraryWithPaths extends Library {
  paths: LibraryPath[];
}

export type LibraryInsert = Database['public']['Tables']['library']['Insert'];
