export interface BaseProps {
    /** Unique identifier */
    id: number;
    /** Display label */
    label: string;
}

export interface ExtendedProps extends BaseProps {
    /** Optional description text */
    description?: string;
    /** Whether the item is active */
    active: boolean;
}
