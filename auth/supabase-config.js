// auth/supabase-config.js
// Single source of truth for Supabase credentials + client singleton
// Every page loads this AFTER the Supabase CDN script

var SAFETYVERSE_SUPABASE_URL = 'https://cfuupedcjroqarmgqcyn.supabase.co';
var SAFETYVERSE_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmdXVwZWRjanJvcWFybWdxY3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjQ1ODksImV4cCI6MjA4Njk0MDU4OX0.kHqVQPBCljGhk8lkd_LN4JxhT1ywOIKapXKmJZD1LEo';

var _svSupabaseClient = null;

function getSafetyVerseSupabase() {
  if (!_svSupabaseClient && window.supabase) {
    _svSupabaseClient = window.supabase.createClient(
      SAFETYVERSE_SUPABASE_URL,
      SAFETYVERSE_SUPABASE_KEY
    );
  }
  return _svSupabaseClient;
}
