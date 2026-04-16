import type { ExtendedProps } from '@/types/props';

/** A further derivation to test multi-level inheritance chains */
export interface DerivedProps extends ExtendedProps {
    /** Priority level */
    priority: 'low' | 'medium' | 'high';
}
