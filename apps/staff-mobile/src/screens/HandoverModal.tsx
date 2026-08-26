import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import SignatureScreen, {
  type SignatureViewRef,
} from "react-native-signature-canvas";

import {
  loadMobileHandover,
  type MobileHandoverDocument,
} from "../features/routes/driverRoutes";

import {
  signMyHandoverDocument,
} from "../features/routes/routeActions";

type Props = {
  visible: boolean;
  bookingId: string | null;
  onClose: () => void;
};

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value)
    ? String(value)
    : String(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const clean = String(value).slice(0, 10);
  const date = new Date(`${clean}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return clean;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function addressText(
  handover: MobileHandoverDocument,
) {
  return [
    handover.setup_address,
    handover.setup_city,
    handover.setup_state,
    handover.setup_zip,
  ]
    .filter(Boolean)
    .join(", ");
}
function cleanOptionNotes(value: string | null) {
  if (!value) {
    return null;
  }

  const clean = String(value)
    .replace(/\[idx:[^\]]*\]/gi, "")
    .replace(/\[gid:[^\]]*\]/gi, "")
    .replace(/\[oid:[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return clean || null;
}

export function HandoverModal({
  visible,
  bookingId,
  onClose,
}: Props) {
  const signatureRef =
    useRef<SignatureViewRef | null>(null);

  const [handover, setHandover] =
    useState<MobileHandoverDocument | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [signing, setSigning] =
    useState(false);

  const [error, setError] =
    useState("");

  const [accepted, setAccepted] =
    useState(false);

  const [signerName, setSignerName] =
    useState("");

  const [signatureDataUrl, setSignatureDataUrl] =
    useState("");

    const [signatureDrawing, setSignatureDrawing] =
  useState(false);

  const loadHandover = useCallback(async () => {
    if (!bookingId) {
      setHandover(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const document =
        await loadMobileHandover(bookingId);

      setHandover(document);

      if (document) {
        setSignerName(
          document.signer_name ||
            document.customer_name ||
            "",
        );
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the handover document.",
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setAccepted(false);
    setSignatureDataUrl("");
    setError("");

    void loadHandover();
  }, [
    loadHandover,
    visible,
  ]);

  const handleSignature = useCallback(
    (signature: string) => {
      setSignatureDataUrl(signature);
    },
    [],
  );

  const clearSignature = useCallback(() => {
    setSignatureDataUrl("");

    signatureRef.current?.clearSignature();
  }, []);

  const signHandover = useCallback(async () => {
    if (!handover || signing) {
      return;
    }

    if (!accepted) {
      setError(
        "Customer acknowledgement is required.",
      );
      return;
    }

    const cleanName =
      signerName.trim();

    if (!cleanName) {
      setError(
        "Customer name is required.",
      );
      return;
    }

    if (!signatureDataUrl) {
      setError(
        "Customer signature is required. Draw the signature and press Use Signature first.",
      );
      return;
    }

    setSigning(true);
    setError("");

    try {
      await signMyHandoverDocument(
        handover.id,
        cleanName,
        signatureDataUrl,
      );

      await loadHandover();
    } catch (signError) {
      setError(
        signError instanceof Error
          ? signError.message
          : "Could not sign the handover document.",
      );
    } finally {
      setSigning(false);
    }
  }, [
    accepted,
    handover,
    loadHandover,
    signatureDataUrl,
    signerName,
    signing,
  ]);

  const signed =
    handover?.status === "signed";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.dismissArea}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>
                CUSTOMER DOCUMENT
              </Text>

              <Text style={styles.title}>
                Equipment Handover
              </Text>

              {handover ? (
                <Text style={styles.subtitle}>
                  Booking #{handover.booking_number}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed
                  ? styles.pressed
                  : null,
              ]}
            >
              <Text style={styles.closeButtonText}>
                Close
              </Text>
            </Pressable>
          </View>

          {loading && !handover ? (
            <View style={styles.loading}>
              <ActivityIndicator
                size="large"
                color="#23313f"
              />

              <Text style={styles.loadingText}>
                Preparing handover…
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                Handover unavailable
              </Text>

              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}

          {handover ? (
            <ScrollView
  showsVerticalScrollIndicator={false}
  scrollEnabled={!signatureDrawing}
  keyboardShouldPersistTaps="handled"
  contentContainerStyle={styles.content}
>
              <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <View>
                    <Text style={styles.summaryLabel}>
                      DELIVERY ACCEPTANCE
                    </Text>

                    <Text style={styles.bookingNumber}>
                      Booking #{handover.booking_number}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      signed
                        ? styles.statusBadgeSigned
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        signed
                          ? styles.statusBadgeTextSigned
                          : null,
                      ]}
                    >
                      {handover.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoCard}>
                    <Text style={styles.infoLabel}>
                      CUSTOMER
                    </Text>

                    <Text style={styles.infoValue}>
                      {handover.customer_name}
                    </Text>

                    {handover.customer_email ? (
                      <Text style={styles.infoSubvalue}>
                        {handover.customer_email}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.infoCard}>
                    <Text style={styles.infoLabel}>
                      EVENT DATE
                    </Text>

                    <Text style={styles.infoValue}>
                      {formatDate(
                        handover.event_date,
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.addressCard}>
                  <Text style={styles.infoLabel}>
                    DELIVERY ADDRESS
                  </Text>

                  <Text style={styles.infoValue}>
                    {addressText(handover) || "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    Products
                  </Text>

                  <Text style={styles.countBadge}>
                    {handover.products.length}
                  </Text>
                </View>

                {handover.products.length > 0 ? (
                  handover.products.map(
                    (item, index) => (
                      <View
                        key={
                          item.booking_item_id ||
                          `product-${index}`
                        }
                        style={styles.itemCard}
                      >
                        <View style={styles.itemCopy}>
                          <Text style={styles.itemTitle}>
                            {item.name}
                          </Text>

                          {item.variant_name ? (
                            <Text style={styles.itemMeta}>
                              {item.variant_name}
                            </Text>
                          ) : null}

                          {cleanOptionNotes(item.notes) ? (
  <Text style={styles.itemNotes}>
    {cleanOptionNotes(item.notes)}
  </Text>
) : null}
                        </View>

                        <View style={styles.quantityBadge}>
                          <Text style={styles.quantityText}>
                            ×{" "}
                            {formatQuantity(
                              item.quantity,
                            )}
                          </Text>
                        </View>
                      </View>
                    ),
                  )
                ) : (
                  <Text style={styles.emptyText}>
                    No products in snapshot.
                  </Text>
                )}
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    Components
                  </Text>

                  <Text style={styles.countBadge}>
                    {handover.components.length}
                  </Text>
                </View>

                {handover.components.length > 0 ? (
                  handover.components.map(
                    (item, index) => (
                      <View
                        key={
                          item.inventory_item_id ||
                          `component-${index}`
                        }
                        style={styles.itemCard}
                      >
                        <View style={styles.itemCopy}>
                          <Text style={styles.itemTitle}>
                            {item.name}
                          </Text>

                          {item.sku ? (
                            <Text style={styles.itemMeta}>
                              SKU: {item.sku}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.quantityBadge}>
                          <Text style={styles.quantityText}>
                            ×{" "}
                            {formatQuantity(
                              item.quantity,
                            )}
                          </Text>
                        </View>
                      </View>
                    ),
                  )
                ) : (
                  <Text style={styles.emptyText}>
                    No components in snapshot.
                  </Text>
                )}
              </View>

              {handover.options.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      Options
                    </Text>

                    <Text style={styles.countBadge}>
                      {handover.options.length}
                    </Text>
                  </View>

                  {handover.options.map(
                    (item, index) => (
                      <View
                        key={
                          item.booking_modifier_id ||
                          `option-${index}`
                        }
                        style={styles.itemCard}
                      >
                        <View style={styles.itemCopy}>
                          <Text style={styles.itemTitle}>
                            {item.name}
                          </Text>

                         {cleanOptionNotes(item.notes) ? (
  <Text style={styles.itemNotes}>
    {cleanOptionNotes(item.notes)}
  </Text>
) : null}
                        </View>

                        <View style={styles.quantityBadge}>
                          <Text style={styles.quantityText}>
                            ×{" "}
                            {formatQuantity(
                              item.quantity,
                            )}
                          </Text>
                        </View>
                      </View>
                    ),
                  )}
                </View>
              ) : null}

              {signed ? (
                <View style={styles.signedCard}>
                  <Text style={styles.signedEyebrow}>
                    SIGNED DOCUMENT
                  </Text>

                  <Text style={styles.signedTitle}>
                    Handover completed
                  </Text>

                  <View style={styles.signedInfo}>
                    <View style={styles.signedInfoCard}>
                      <Text style={styles.signedLabel}>
                        SIGNER
                      </Text>

                      <Text style={styles.signedValue}>
                        {handover.signer_name ||
                          handover.customer_name}
                      </Text>
                    </View>

                    <View style={styles.signedInfoCard}>
                      <Text style={styles.signedLabel}>
                        SIGNED
                      </Text>

                      <Text style={styles.signedValue}>
                        {formatDateTime(
                          handover.signed_at,
                        )}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.acceptanceCard}>
                  <Text style={styles.acceptanceEyebrow}>
                    CUSTOMER ACCEPTANCE
                  </Text>

                  <Pressable
                    onPress={() =>
                      setAccepted(
                        (current) => !current,
                      )
                    }
                    style={styles.acceptanceRow}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        accepted
                          ? styles.checkboxChecked
                          : null,
                      ]}
                    >
                      <Text style={styles.checkboxText}>
                        {accepted ? "✓" : ""}
                      </Text>
                    </View>

                    <Text style={styles.acceptanceText}>
                      {
                        handover.acknowledgement_label
                      }
                    </Text>
                  </Pressable>

                  <Text style={styles.fieldLabel}>
                    CUSTOMER FULL NAME
                  </Text>

                  <TextInput
                    value={signerName}
                    onChangeText={setSignerName}
                    autoCapitalize="words"
                    style={styles.nameInput}
                  />

                  <Text style={styles.fieldLabel}>
                    {handover.signature_label.toUpperCase()}
                  </Text>

                  <View style={styles.signatureContainer}>
                   <SignatureScreen
  ref={signatureRef}
  onOK={handleSignature}
  onEmpty={() => {
    setSignatureDataUrl("");
  }}
  onBegin={() => {
    setSignatureDrawing(true);
    setError("");
  }}
  onEnd={() => {
    setSignatureDrawing(false);

    /*
     * readSignature() converts what the customer
     * just drew into the PNG data URL expected by
     * sign_handover_document().
     *
     * A tiny delay lets the final stroke finish
     * rendering before the canvas is exported.
     */
    setTimeout(() => {
      signatureRef.current?.readSignature();
    }, 80);
  }}
  descriptionText=""
  clearText=""
  confirmText=""
  webStyle={`
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #ffffff;
    }

    .m-signature-pad {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      box-shadow: none;
      border: none;
    }

    .m-signature-pad--body {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      border: none;
    }

    .m-signature-pad--body canvas {
      width: 100% !important;
      height: 100% !important;
      touch-action: none;
    }

    .m-signature-pad--footer {
      display: none;
    }
  `}
/>
                  </View>

                  {signatureDataUrl ? (
                    <View style={styles.signatureReady}>
                      <Text style={styles.signatureReadyText}>
                        ✓ Signature ready
                      </Text>

                      <Pressable
                        onPress={clearSignature}
                      >
                        <Text style={styles.clearSignatureText}>
                          Clear
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <Pressable
                    disabled={
                      signing ||
                      !accepted ||
                      !signerName.trim() ||
                      !signatureDataUrl
                    }
                    onPress={() =>
                      void signHandover()
                    }
                    style={({ pressed }) => [
                      styles.signButton,

                      pressed
                        ? styles.pressed
                        : null,

                      signing ||
                      !accepted ||
                      !signerName.trim() ||
                      !signatureDataUrl
                        ? styles.disabled
                        : null,
                    ]}
                  >
                    {signing ? (
                      <ActivityIndicator
                        color="#ffffff"
                      />
                    ) : (
                      <Text style={styles.signButtonText}>
                        Accept & Sign Handover
                      </Text>
                    )}
                  </Pressable>

                  <Text style={styles.disclaimer}>
                    Signing confirms delivery and acceptance only.
                    It does not modify the rental contract.
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,27,34,0.48)",
    justifyContent: "flex-end",
  },

  dismissArea: {
    flex: 1,
  },

  sheet: {
    backgroundColor: "#f5f1e8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "92%",
    minHeight: "72%",
    overflow: "hidden",
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#c7bfb4",
    marginTop: 9,
  },

  header: {
    alignItems: "center",
    borderBottomColor: "#dfd8ce",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 15,
  },

  headerCopy: {
    flex: 1,
    minWidth: 0,
  },

  eyebrow: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },

  title: {
    color: "#23313f",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
  },

  subtitle: {
    color: "#81766a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  closeButton: {
    borderColor: "#d1c8bb",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 13,
    marginLeft: 12,
  },

  closeButtonText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
  },

  loading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },

  loadingText: {
    color: "#81766a",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },

  errorCard: {
    backgroundColor: "#fff1f0",
    borderColor: "#efb7b3",
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 18,
    marginTop: 12,
    padding: 12,
  },

  errorTitle: {
    color: "#8c2e2a",
    fontSize: 13,
    fontWeight: "900",
  },

  errorText: {
    color: "#7a4844",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },

  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
  },

  summaryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },

  summaryLabel: {
    color: "#9a723e",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  bookingNumber: {
    color: "#23313f",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },

  statusBadge: {
    backgroundColor: "#fff4d8",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusBadgeSigned: {
    backgroundColor: "#e8f3e5",
  },

  statusBadgeText: {
    color: "#8a6b20",
    fontSize: 9,
    fontWeight: "900",
  },

  statusBadgeTextSigned: {
    color: "#5f735c",
  },

  infoGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  infoCard: {
    backgroundColor: "#fcfaf7",
    borderRadius: 13,
    flex: 1,
    padding: 10,
  },

  addressCard: {
    backgroundColor: "#fcfaf7",
    borderRadius: 13,
    marginTop: 8,
    padding: 10,
  },

  infoLabel: {
    color: "#9a723e",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  infoValue: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 3,
  },

  infoSubvalue: {
    color: "#81766a",
    fontSize: 10,
    marginTop: 2,
  },

  section: {
    marginTop: 20,
  },

  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  sectionTitle: {
    color: "#23313f",
    fontSize: 17,
    fontWeight: "900",
  },

  countBadge: {
    backgroundColor: "#ebe5dc",
    borderRadius: 999,
    color: "#6c6258",
    fontSize: 10,
    fontWeight: "900",
    minWidth: 27,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    textAlign: "center",
  },

  itemCard: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#e2ddd4",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 8,
    padding: 11,
  },

  itemCopy: {
    flex: 1,
    minWidth: 0,
  },

  itemTitle: {
    color: "#23313f",
    fontSize: 13,
    fontWeight: "900",
  },

  itemMeta: {
    color: "#81766a",
    fontSize: 10,
    marginTop: 2,
  },

  itemNotes: {
    color: "#8b8177",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  quantityBadge: {
    backgroundColor: "#f5f1e8",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  quantityText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
  },

  emptyText: {
    color: "#81766a",
    fontSize: 11,
    paddingVertical: 8,
  },

  signedCard: {
    backgroundColor: "#e8f3e5",
    borderRadius: 20,
    marginTop: 22,
    padding: 14,
  },

  signedEyebrow: {
    color: "#5f735c",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  signedTitle: {
    color: "#40513e",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },

  signedInfo: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  signedInfoCard: {
    backgroundColor: "rgba(255,255,255,0.68)",
    borderRadius: 13,
    flex: 1,
    padding: 10,
  },

  signedLabel: {
    color: "#5f735c",
    fontSize: 8,
    fontWeight: "900",
  },

  signedValue: {
    color: "#40513e",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },

  acceptanceCard: {
    backgroundColor: "#fffaf2",
    borderColor: "#e7d8bf",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 22,
    padding: 14,
  },

  acceptanceEyebrow: {
    color: "#9a723e",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  acceptanceRow: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    padding: 12,
  },

  checkbox: {
    alignItems: "center",
    borderColor: "#cfc4b6",
    borderRadius: 6,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    marginTop: 1,
    width: 22,
  },

  checkboxChecked: {
    backgroundColor: "#23313f",
    borderColor: "#23313f",
  },

  checkboxText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  acceptanceText: {
    color: "#4b4339",
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  fieldLabel: {
    color: "#9a723e",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 16,
  },

  nameInput: {
    backgroundColor: "#ffffff",
    borderColor: "#d8cec0",
    borderRadius: 14,
    borderWidth: 1,
    color: "#23313f",
    fontSize: 13,
    minHeight: 48,
    marginTop: 7,
    paddingHorizontal: 12,
  },

  signatureContainer: {
  backgroundColor: "#ffffff",
  borderColor: "#d8cec0",
  borderRadius: 14,
  borderWidth: 1,
  height: 220,
  marginTop: 7,
  overflow: "hidden",
},

  signatureReady: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },

  signatureReadyText: {
    color: "#5f735c",
    fontSize: 11,
    fontWeight: "900",
  },

  clearSignatureText: {
    color: "#8c2e2a",
    fontSize: 11,
    fontWeight: "800",
  },

  signButton: {
    alignItems: "center",
    backgroundColor: "#23313f",
    borderRadius: 15,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 52,
  },

  signButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  disclaimer: {
    color: "#8b8177",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 9,
    textAlign: "center",
  },

  pressed: {
    opacity: 0.7,
  },

  disabled: {
    opacity: 0.4,
  },
});