import { useEffect, useState } from 'react';

/**
 * Whole seconds until a server-time deadline, corrected for the difference between clocks.
 */
export default function useCountdown(deadline, clockOffset) {
    const compute = () => (deadline ? Math.max(0, Math.ceil(deadline - (Date.now() + clockOffset) / 1000)) : null);
    const [seconds, setSeconds] = useState(compute);

    useEffect(() => {
        setSeconds(compute());

        if (!deadline) {
            return undefined;
        }

        const timer = setInterval(() => setSeconds(compute()), 250);

        return () => clearInterval(timer);
    }, [deadline, clockOffset]);

    return seconds;
}
