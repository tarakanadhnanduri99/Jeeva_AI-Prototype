import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, userData?: any) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  profile: any;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  // Local cache helpers to hydrate profile instantly after auth
  const getProfileCacheKey = (userId: string) => `profile_cache:${userId}`;
  const readCachedProfile = (userId?: string | null) => {
    try {
      if (!userId) return null;
      const raw = localStorage.getItem(getProfileCacheKey(userId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const writeCachedProfile = (userId?: string | null, value?: any) => {
    try {
      if (!userId || !value) return;
      localStorage.setItem(
        getProfileCacheKey(userId),
        JSON.stringify({ ...value, _cachedAt: Date.now() })
      );
    } catch {
      // ignore cache write errors
    }
  };

  const refreshProfile = async () => {
    if (!session?.user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,user_id,role,first_name,last_name,email,phone,specialization')
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(data);
        writeCachedProfile(session.user.id, data);
      }
    } catch (error) {
      console.error('Error in refreshProfile:', error);
    }
  };

  useEffect(() => {
    let mounted = true;
    let initialLoadComplete = false;

    // Check for existing session immediately
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        // Hydrate from cache or user metadata immediately to avoid UI jank
        if (session?.user) {
          const cached = readCachedProfile(session.user.id);
          if (cached) {
            setProfile(cached);
          } else if (session.user.user_metadata) {
            const meta = session.user.user_metadata as any;
            const optimisticProfile = {
              user_id: session.user.id,
              role: meta.role,
              first_name: meta.first_name,
              last_name: meta.last_name,
              email: session.user.email,
              phone: meta.phone,
              specialization: meta.specialization,
            };
            // Only set if we actually have at least a name or role
            if (optimisticProfile.role || optimisticProfile.first_name || optimisticProfile.last_name) {
              setProfile(optimisticProfile as any);
            }
          }
        }
        initialLoadComplete = true;
        setLoading(false);
        
        if (session?.user) {
          // Fetch fresh data in background
          refreshProfile();
        }
      } catch (error) {
        console.error('Error in initAuth:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        
        console.log('Auth state change:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
        
        // Only set loading to false if this isn't the initial load
        if (initialLoadComplete) {
          setLoading(false);
        }
        
        // Handle profile fetching separately to avoid deadlock
        if (session?.user) {
          // Re-hydrate from cache quickly on transitions like sign-in
          const cached = readCachedProfile(session.user.id);
          if (cached) {
            setProfile(cached);
          }
          refreshProfile();
        } else {
          setProfile(null);
        }
      }
    );

    // Initialize auth immediately
    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, userData: any = {}) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: userData
      }
    });

    if (error && error.message.includes('User already registered')) {
      return { 
        error: { 
          ...error, 
          message: 'An account with this email already exists. Please sign in instead or use the forgot password option.' 
        } 
      };
    }
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Attempting sign in for:', email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      
      if (error) {
        console.error('Sign in error:', error);
      } else {
        console.log('Sign in successful for:', data.user?.email);
        // Optimistically set profile from user metadata if present
        const user = data.user;
        if (user) {
          const meta = (user.user_metadata || {}) as any;
          const optimisticProfile = {
            user_id: user.id,
            role: meta.role,
            first_name: meta.first_name,
            last_name: meta.last_name,
            email: user.email,
            phone: meta.phone,
            specialization: meta.specialization,
          };
          if (optimisticProfile.role || optimisticProfile.first_name || optimisticProfile.last_name) {
            setProfile(optimisticProfile as any);
            writeCachedProfile(user.id, optimisticProfile);
          }
          // Also kick off a background refresh
          refreshProfile();
        }
      }
      
      return { error };
    } catch (error) {
      console.error('Sign in exception:', error);
      return { error };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        resetPassword,
        profile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};