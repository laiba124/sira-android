import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { SiraIncident } from '../types/incident';
import {
  formatCoordinate,
  formatDateShort,
  getIncidentTypeMeta,
  getPublicIncidentCode,
  getSeverityLabel,
  getShortStatusLabel,
} from '../types/incident';

type Props = {
  incident: SiraIncident;
  onPress: () => void;
};

function typeColor(_type: string) {
  return '#f97316';
}

function severityColor(severity: string) {
  if (severity === 'critical') return '#991b1b';
  if (severity === 'high') return '#dc2626';
  if (severity === 'low') return '#16a34a';
  return '#f59e0b';
}

function statusStyles(status: string) {
  if (status === 'resolved') return { backgroundColor: '#dcfce7', color: '#15803d' };
  if (status === 'under_review' || status === 'in_progress') {
    return { backgroundColor: '#ffedd5', color: '#c2410c' };
  }
  return { backgroundColor: '#fee2e2', color: '#b91c1c' };
}

export default function IncidentCard({ incident, onPress }: Props) {
  const meta = getIncidentTypeMeta(incident.incident_type);
  const typeAccent = typeColor(incident.incident_type);
  const severityAccent = severityColor(incident.severity);
  const statusAccent = statusStyles(incident.status);
  const locationText = incident.address_text || incident.city || 'GPS selected location';
  const incidentCode = getPublicIncidentCode(incident);

  return (
    <Pressable style={styles.card} onPress={onPress} android_ripple={{ color: '#eef5ff' }}>
      <View style={[styles.typeIcon, { backgroundColor: typeAccent }]}> 
        <Ionicons name={meta.icon as any} size={22} color="#ffffff" />
      </View>

      <View style={styles.mainPane}>
        <View style={styles.topLine}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.code} numberOfLines={1}>{incidentCode}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusAccent.backgroundColor }]}> 
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.statusText, { color: statusAccent.color }]} numberOfLines={1}>{getShortStatusLabel(incident.status)}</Text>
          </View>
        </View>

        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title} numberOfLines={1}>{meta.shortLabel}</Text>

        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color="#64748b" />
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.metaText} numberOfLines={1}>{locationText}</Text>
        </View>

        <View style={styles.bottomLine}>
          <View style={styles.metaRowSmall}>
            <Ionicons name="calendar-outline" size={12} color="#64748b" />
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.dateText} numberOfLines={1}>{formatDateShort(incident.created_at)}</Text>
          </View>
          <View style={styles.severityRow}>
            <View style={[styles.dot, { backgroundColor: severityAccent }]} />
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.severityText} numberOfLines={1}>{getSeverityLabel(incident.severity)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.locationPane}>
        <View style={styles.miniMapBox}>
          <Ionicons name="location" size={23} color={typeAccent} />
        </View>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.coordText} numberOfLines={1}>{formatCoordinate(incident.latitude, 'lat')}</Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.coordText} numberOfLines={1}>{formatCoordinate(incident.longitude, 'lng')}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#64748b" style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 7,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e7edf5',
    shadowColor: '#0f172a',
    shadowOpacity: 0.055,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mainPane: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  code: {
    flex: 1,
    minWidth: 0,
    color: '#0f172a',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  statusPill: {
    maxWidth: 72,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: '900',
  },
  title: {
    color: '#1e293b',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 3,
    marginBottom: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  metaText: {
    flex: 1,
    color: '#64748b',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  bottomLine: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRowSmall: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    flex: 1,
    color: '#64748b',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '600',
  },
  severityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  severityText: {
    color: '#475569',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '800',
  },
  locationPane: {
    width: 74,
    alignItems: 'center',
  },
  miniMapBox: {
    width: 70,
    height: 43,
    borderRadius: 10,
    backgroundColor: '#eef4fb',
    borderWidth: 1,
    borderColor: '#dbe7f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  coordText: {
    color: '#0f172a',
    fontSize: 8.5,
    fontWeight: '800',
    lineHeight: 11,
  },
  chevron: {
    marginLeft: 2,
  },
});
