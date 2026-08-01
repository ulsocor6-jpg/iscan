export async function fetchMissionSnapshot() {
    const res = await fetch("/api/v1/mission-control/snapshot", {
        credentials: "include"
    });

    if (!res.ok) {
        throw new Error("Unable to fetch Mission Control snapshot.");
    }

    return await res.json();
}
