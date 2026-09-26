import DropdownField from '@/components/DropdownField';
import type { SlotVisibility, CoachClient, ClientGroup } from '@/types/database';

interface Props {
  clients: CoachClient[];
  groups: ClientGroup[];
  visibility: SlotVisibility;
  connectionId: string | null;
  groupId: string | null;
  onChange: (v: SlotVisibility, connectionId: string | null, groupId: string | null) => void;
}

const EVERYONE = 'Everyone';

/** "Who can book this" — Everyone / a single client / a segment. */
export default function SlotTargetingField({ clients, groups, visibility, connectionId, groupId, onChange }: Props) {
  const clientLabel = (c: CoachClient) => `Client: ${c.athlete_name}`;
  const groupLabel = (g: ClientGroup) => `Group: ${g.name}`;

  const options = [EVERYONE, ...clients.map(clientLabel), ...groups.map(groupLabel)];

  let value = EVERYONE;
  if (visibility === 'individual') value = clients.find((c) => c.connection_id === connectionId) ? clientLabel(clients.find((c) => c.connection_id === connectionId)!) : EVERYONE;
  else if (visibility === 'group') value = groups.find((g) => g.id === groupId) ? groupLabel(groups.find((g) => g.id === groupId)!) : EVERYONE;

  const handleChange = (label: string) => {
    if (label === EVERYONE) return onChange('all', null, null);
    const client = clients.find((c) => clientLabel(c) === label);
    if (client) return onChange('individual', client.connection_id, null);
    const group = groups.find((g) => groupLabel(g) === label);
    if (group) return onChange('group', null, group.id);
    onChange('all', null, null);
  };

  return <DropdownField label="Who can book this" value={value} options={options} onChange={handleChange} />;
}
