import useMissionControl from "../../hooks/useMissionControl";

export default function ArchitectureTree() {

    const { snapshot, loading } = useMissionControl();

    if (loading) {
        return <div style={{ padding: 20 }}>Loading...</div>;
    }

    if (!snapshot) {
        return <div style={{ padding: 20 }}>No Mission Snapshot</div>;
    }

    function Section({
        title,
        children
    }: {
        title: string;
        children: React.ReactNode;
    }) {

        return (
            <div style={{ marginBottom: 24 }}>
                <div
                    style={{
                        fontWeight: 700,
                        marginBottom: 10,
                        fontSize: 15,
                        color: "#8fb6ff"
                    }}
                >
                    {title}
                </div>

                {children}
            </div>
        );
    }

    return (

        <div
            style={{
                padding: 16,
                overflowY: "auto",
                height: "100%"
            }}
        >

            <Section title="Runtime Observer">
                <div>
                    Active: {snapshot.runtime?.active?.length ?? 0}
                </div>

                <div>
                    History: {snapshot.runtime?.history?.length ?? 0}
                </div>
            </Section>

            <Section title="Health Registry">
                <div>
                    Status: {snapshot.health?.overallStatus ?? "UNKNOWN"}
                </div>

                <div>
                    Nodes: {snapshot.health?.nodes?.length ?? 0}
                </div>
            </Section>

            <Section title="Mission Observer">
                <div>
                    Running: {snapshot.missions?.running?.length ?? 0}
                </div>
            </Section>

        </div>

    );

}
