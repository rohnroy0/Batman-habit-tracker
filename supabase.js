import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yvhvnlqeuojmuntdcchk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2aHZubHFldW9qbXVudGRjY2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODUyMTUsImV4cCI6MjA5NjE2MTIxNX0.H7jdhmgh9sYVs6dsLHA04IAIoPlOGJwyM6E7mvRuWyQ';

export const supabase = createClient(supabaseUrl, supabaseKey);
