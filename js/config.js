const SUPABASE_URL = 'https://ezkckpycfhzyeaagrgwb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6a2NrcHljZmh6eWVhYWdyZ3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzg3MjUsImV4cCI6MjA5NzcxNDcyNX0.ycs_YPTNV6wB_-443e7JSoRYPUAfAoeFm2zsGvK8tIY';

const KEY = 'gastinhos_config';
export const getConfig = () => ({ url: SUPABASE_URL, key: SUPABASE_KEY });
export const saveConfig = () => {};
export const clearConfig = () => {};
