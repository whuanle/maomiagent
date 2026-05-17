import { Select } from "antd";
import { useEffect, useMemo, useState } from "react";
import { getDesktopModelRuntimeSelectionSnapshot } from "../../../lib/desktop-models";
import type { DesktopModelRuntimeSelectionSnapshot } from "../../../../shared/desktop-models";
import {
  buildDesktopRuntimeModelOptionGroups,
  buildDesktopRuntimeModelOptions,
  resolveDesktopRuntimeSelectedValue,
  resolveDesktopRuntimeSelectionPatch,
} from "../../models/services/runtime-selection";

type Props = {
  selectedChannelId?: string;
  selectedModelId?: string;
  allowClear?: boolean;
  showSearch?: boolean;
  placeholder?: string;
  notFoundContent?: string;
  onInvalidSelection?: () => void;
  onChange: (patch: { selectedChannelId?: string; selectedModelId?: string }) => void;
};

export function RuntimeModelSelect(props: Props) {
  const [snapshot, setSnapshot] = useState<DesktopModelRuntimeSelectionSnapshot | null>(null);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const response = await getDesktopModelRuntimeSelectionSnapshot();
        if (disposed) {
          return;
        }
        setSnapshot(response.item);
      } catch {
        if (!disposed) {
          setSnapshot(null);
        }
      } finally {
        if (!disposed) {
          setSnapshotLoaded(true);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const modelOptions = useMemo(() => {
    return buildDesktopRuntimeModelOptions({
      snapshot,
      selectedChannelId: props.selectedChannelId,
      selectedModelId: props.selectedModelId,
    });
  }, [props.selectedChannelId, props.selectedModelId, snapshot]);

  const optionGroups = useMemo(() => {
    return buildDesktopRuntimeModelOptionGroups(modelOptions);
  }, [modelOptions]);

  const selectedValue = useMemo(() => {
    return resolveDesktopRuntimeSelectedValue({
      snapshot,
      selectedChannelId: props.selectedChannelId,
      selectedModelId: props.selectedModelId,
    });
  }, [props.selectedChannelId, props.selectedModelId, snapshot]);

  useEffect(() => {
    if (!snapshotLoaded || !selectedValue) {
      return;
    }

    const matched = modelOptions.some((item) => item.value === selectedValue);
    if (matched) {
      return;
    }

    const fallbackOption = modelOptions.find((item) => !item.disabled);
    if (fallbackOption) {
      props.onChange({
        selectedChannelId: fallbackOption.channelId,
        selectedModelId: fallbackOption.modelId,
      });
      return;
    }

    props.onChange({
      selectedChannelId: undefined,
      selectedModelId: undefined,
    });
  }, [modelOptions, props.onChange, selectedValue, snapshotLoaded]);

  return (
    <Select
      allowClear={props.allowClear}
      showSearch={props.showSearch}
      value={selectedValue}
      placeholder={props.placeholder}
      notFoundContent={props.notFoundContent}
      optionFilterProp="label"
      options={optionGroups.map((group) => ({
        label: group.label,
        options: group.options.map((option) => ({
          value: option.value,
          label: option.label,
          disabled: option.disabled,
        })),
      }))}
      onChange={(value) => {
        props.onChange(resolveDesktopRuntimeSelectionPatch(value));
      }}
    />
  );
}
