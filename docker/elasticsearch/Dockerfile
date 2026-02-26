FROM docker.elastic.co/elasticsearch/elasticsearch:8.17.10

# Install the Sudachi analysis plugin (v3.4.0 for ES 8.17.10)
RUN elasticsearch-plugin install --batch \
    https://github.com/WorksApplications/elasticsearch-sudachi/releases/download/v3.4.0/elasticsearch-8.17.10-analysis-sudachi-3.4.0.zip

# Download and install the Sudachi core dictionary
# system_core.dic is the default resource_name expected by the plugin
RUN mkdir -p /usr/share/elasticsearch/config/sudachi && \
    curl -fsSL https://github.com/WorksApplications/SudachiDict/releases/download/v20260116/sudachi-dictionary-20260116-core.zip \
    -o /tmp/sudachi-dict.zip && \
    unzip /tmp/sudachi-dict.zip -d /tmp/sudachi-dict && \
    find /tmp/sudachi-dict -name "system_core.dic" \
        -exec mv {} /usr/share/elasticsearch/config/sudachi/system_core.dic \; && \
    rm -rf /tmp/sudachi-dict /tmp/sudachi-dict.zip
