document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const progressWrap = document.getElementById('upload-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const form = document.querySelector('form');
    const etablissement1 = document.getElementById('etablissement1');
    const etablissement2 = document.getElementById('etablissement2');
    const mentionSelect = document.getElementById('mention');
    const mentionOriginalOptions = mentionSelect ? Array.from(mentionSelect.options).map(option => option.cloneNode(true)) : [];
    const API_URL = (location.port === '3000' || location.port === '')
        ? '/submit'
        : 'http://' + location.hostname + ':3000/submit';
    let selectedFiles = [];

    function normalizeText(value) {
        return (value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    function getSelectedEtablissements() {
        const etablissements = [];
        [etablissement1, etablissement2].forEach((select) => {
            if (!select) return;
            const selected = select.options[select.selectedIndex];
            if (selected && selected.value) {
                etablissements.push(selected.textContent.trim());
            }
        });
        return [...new Set(etablissements)];
    }

    function getMentionEtablissement(optionText) {
        const matches = Array.from(optionText.matchAll(/\(([^)]+)\)/g));
        if (matches.length === 0) return '';
        return matches[matches.length - 1][1].trim();
    }

    function updateMentionOptions() {
        if (!mentionSelect) return;

        const selectedEtablissements = getSelectedEtablissements();
        const selectedMentionValue = mentionSelect.value;
        const allOptions = mentionOriginalOptions.slice();
        const placeholder = allOptions.find(option => option.value === '') || new Option('Sélectionner...', '');
        const mentionOptions = allOptions.filter(option => option.value !== '');
        const isDisabled = selectedEtablissements.length === 0;

        mentionSelect.innerHTML = '';
        const placeholderClone = placeholder.cloneNode(true);
        placeholderClone.textContent = isDisabled ? 'Veuillez sélectionner d’abord un établissement' : placeholderClone.textContent;
        mentionSelect.appendChild(placeholderClone);

        const filteredOptions = isDisabled
            ? []
            : mentionOptions.filter((option) => {
                const mentionEtablissement = getMentionEtablissement(option.textContent);
                return selectedEtablissements.some((etablissement) =>
                    normalizeText(mentionEtablissement) === normalizeText(etablissement)
                );
            });

        filteredOptions.forEach((option) => {
            const clonedOption = option.cloneNode(true);
            clonedOption.selected = option.value !== '' && option.value === selectedMentionValue;
            mentionSelect.appendChild(clonedOption);
        });

        mentionSelect.disabled = isDisabled;
        if (isDisabled) {
            mentionSelect.selectedIndex = 0;
        } else if (selectedMentionValue && filteredOptions.some(option => option.value === selectedMentionValue)) {
            mentionSelect.value = selectedMentionValue;
        } else {
            mentionSelect.selectedIndex = 0;
        }
    }

    const mentionSelectContainer = document.getElementById('mention-select-container');
    const mentionManualContainer = document.getElementById('mention-manual-container');
    const mentionManualInput = document.getElementById('mentionManual');

    function toggleMentionInput() {
        if (!mentionSelect || !mentionManualInput || !mentionSelectContainer || !mentionManualContainer || !etablissement2) return;

        const isOther = etablissement2.value === 'autre';
        if (isOther) {
            mentionSelectContainer.classList.add('hidden');
            mentionManualContainer.classList.remove('hidden');
            mentionSelect.disabled = true;
            mentionSelect.required = false;
            mentionSelect.selectedIndex = 0;
            mentionManualInput.disabled = false;
            mentionManualInput.required = true;
        } else {
            mentionSelectContainer.classList.remove('hidden');
            mentionManualContainer.classList.add('hidden');
            mentionSelect.disabled = false;
            mentionSelect.required = true;
            mentionManualInput.disabled = true;
            mentionManualInput.required = false;
            mentionManualInput.value = '';
        }
    }

    [etablissement1, etablissement2].forEach((select) => {
        if (!select) return;
        select.addEventListener('change', () => {
            updateMentionOptions();
            toggleMentionInput();
        });
    });

    updateMentionOptions();
    toggleMentionInput();

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        if (dropzone) dropzone.classList.add('dragover');
    }

    function unhighlight() {
        if (dropzone) dropzone.classList.remove('dragover');
    }

    function animateProgressBar(target, duration, onDone) {
        if (progressWrap) progressWrap.classList.remove('hidden');
        if (progressBar) {
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
        }
        if (progressText) progressText.textContent = '0%';
        const start = performance.now();

        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            if (progressBar) {
                progressBar.style.transition = 'width 0.15s linear';
                progressBar.style.width = Math.round(eased * target) + '%';
            }
            if (progressText) progressText.textContent = Math.round(eased * target) + '%';
            if (progress < 1) requestAnimationFrame(step);
            else if (onDone) onDone();
        }

        requestAnimationFrame(step);
    }

    function compressImage(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = function () {
                const MAX_DIM = 1600;
                let width = img.width;
                let height = img.height;
                const ratio = Math.min(MAX_DIM / width, MAX_DIM / height, 1);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                canvas.toBlob((blob) => {
                    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                    resolve(new File([blob], name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.8);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                resolve(file);
            };
            img.src = url;
        });
    }

    function handleFiles(files) {
        const MAX = 8 * 1024 * 1024;
        const MAX_PDF = 4 * 1024 * 1024;
        const tooLarge = [];
        const tasks = [];
        Array.from(files).forEach((file) => {
            if (file.size > MAX) {
                tooLarge.push(file.name);
                return;
            }
            const type = (file.type || '').toLowerCase();
            if (type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name)) {
                tasks.push(compressImage(file));
            } else if (file.size > MAX_PDF) {
                tooLarge.push(file.name + ' (PDF max 4 Mo)');
            } else {
                tasks.push(Promise.resolve(file));
            }
        });
        if (tooLarge.length > 0 && progressWrap) {
            progressWrap.classList.remove('hidden');
            progressText.textContent = `${tooLarge.length} fichier(s) trop volumineux (max 8 Mo)`;
        }
        if (tasks.length === 0) return;
        animateProgressBar(60, 800, () => {
            if (progressText) progressText.textContent = 'Réduction de la photo…';
        });
        Promise.all(tasks).then((results) => {
            selectedFiles = results;
            animateProgressBar(100, 400, () => {
                const textEl = dropzone ? dropzone.querySelector('.font-label-md') : null;
                if (textEl) {
                    textEl.textContent = `${selectedFiles.length} fichier(s) prêt(s) à l'envoi`;
                    textEl.classList.add('text-primary');
                }
                if (progressText) progressText.textContent = 'Prêt';
            });
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((name) => {
            dropzone.addEventListener(name, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach((name) => {
            dropzone.addEventListener(name, highlight, false);
        });
        ['dragleave', 'drop'].forEach((name) => {
            dropzone.addEventListener(name, unhighlight, false);
        });
        dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files), false);
        fileInput.addEventListener('change', function () {
            handleFiles(this.files);
        });
    }

    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Envoi en cours…';
            }
            const formData = new FormData(form);
            if (selectedFiles.length > 0) {
                formData.delete('photo');
                formData.append('photo', selectedFiles[0]);
            }
            const xhr = new XMLHttpRequest();
            xhr.open('POST', API_URL);
            if (selectedFiles.length > 0) {
                if (progressWrap) progressWrap.classList.remove('hidden');
                if (progressText) progressText.textContent = 'Téléversement…';
                xhr.upload.onprogress = function (event) {
                    if (event.lengthComputable && progressBar && progressText) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        progressBar.style.transition = 'width 0.15s linear';
                        progressBar.style.width = percent + '%';
                        progressText.textContent = percent + '%';
                    }
                };
            }
            xhr.onload = function () {
                const temp = document.createElement('div');
                temp.innerHTML = xhr.responseText;
                const errors = Array.from(temp.querySelectorAll('.err')).map((el) => el.textContent);
                if (xhr.status === 200 && errors.length === 0) {
                    const formWrapper = form.closest('.w-full.max-w-form-max-width');
                    if (formWrapper) formWrapper.classList.add('hidden');
                    const modalSuccess = document.getElementById('modal-succes');
                    if (modalSuccess) modalSuccess.classList.remove('hidden');
                } else {
                    const errorList = document.getElementById('liste-erreurs');
                    if (errorList) {
                        errorList.innerHTML = '';
                        const messages = errors.length > 0 ? errors : ['Erreur serveur (' + xhr.status + '). Réessayez.'];
                        messages.forEach((message) => {
                            const paragraph = document.createElement('p');
                            paragraph.className = 'mb-2';
                            paragraph.textContent = '• ' + message;
                            errorList.appendChild(paragraph);
                        });
                    }
                    const modalError = document.getElementById('modal-erreur');
                    if (modalError) modalError.classList.remove('hidden');
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Soumettre le formulaire';
                    }
                }
            };
            xhr.onerror = function () {
                alert('Erreur réseau. Vérifiez votre connexion puis réessayez.');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Soumettre le formulaire';
                }
            };
            xhr.send(formData);
        });

        const btnCloseSuccess = document.getElementById('btn-fermer-succes');
        if (btnCloseSuccess) {
            btnCloseSuccess.addEventListener('click', () => window.location.reload());
        }

        const btnCloseError = document.getElementById('btn-fermer-erreur');
        if (btnCloseError) {
            btnCloseError.addEventListener('click', () => {
                const modalError = document.getElementById('modal-erreur');
                if (modalError) modalError.classList.add('hidden');
            });
        }
    }
});
PY