import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Утилита для расчета треугольного остатка
function getTriangularRemainder(n) {
    const k = Math.floor((Math.sqrt(8 * n + 1) - 1) / 2);
    const blockStart = k * (k + 1) / 2;
    return n - blockStart;
}

// Класс для позиции куба
class Position {
    constructor(number) {
        this.number = number;
        this.status = false; // false = passive, true = active
        this.orbit = Math.floor(Math.sqrt(2 * number + 2.25) - 0.5) - 1;
        this.numOnOrbit = getTriangularRemainder(number);
        this.radius = 0.3 + this.orbit * 1.2;
        this.quantity = 2 + this.orbit;
        this.passiveAngle = (2 * Math.PI) / (this.quantity + 1);
        this.activeAngle = (2 * Math.PI) / this.quantity;
        this.currentCube = null;
        this.targetX = 0;
        this.targetY = 0;
        this.targetZ = 0;
        this.updatePosition();
    }

    updatePosition(activeOrbit = -1) {
        const angle = this.status ? this.activeAngle : this.passiveAngle;
        const currentAngle = this.numOnOrbit * angle;
        
        // Расчет X координаты в зависимости от расстояния до активной орбиты
        const orbitDiff = Math.abs(activeOrbit - this.orbit);
        if (activeOrbit === this.orbit) {
            this.targetX = 1.8;
        } else if (orbitDiff === 1) {
            this.targetX = 0.6;
        } else if (orbitDiff === 2) {
            this.targetX = -0.6;
        } else {
            this.targetX = -1.8;
        }
        
        this.targetY = this.radius * Math.cos(currentAngle);
        this.targetZ = this.radius * Math.sin(currentAngle);
    }

    setStatus(status, activeOrbit) {
        this.status = status;
        this.updatePosition(activeOrbit);
    }

    getPosition() {
        return new THREE.Vector3(this.targetX, this.targetY, this.targetZ);
    }

    // Проверка, находится ли куб в окрестности этой позиции
    isCubeNearby(cube, threshold = 0.5) {
        if (!cube || !cube.mesh) return false;
        const cubePos = cube.mesh.position;
        const distance = Math.sqrt(
            Math.pow(cubePos.x - this.targetX, 2) +
            Math.pow(cubePos.y - this.targetY, 2) +
            Math.pow(cubePos.z - this.targetZ, 2)
        );
        return distance < threshold;
    }
}

// Класс для куба
class Cube {
    constructor(number, modelPath, scene) {
        this.number = number;
        this.modelPath = modelPath;
        this.scene = scene;
        this.mesh = null;
        this.model = null;
        this.isActive = false;
        this.isEntering = false;
        this.isLeaving = false;
        this.currentPosition = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    async load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(
                this.modelPath,
                (gltf) => {
                    this.model = gltf.scene;
                    this.mesh = gltf.scene.clone();
                    this.mesh.userData.cube = this;
                    this.scene.add(this.mesh);
                    resolve();
                },
                undefined,
                reject
            );
        });
    }

    setPosition(position) {
        this.currentPosition = position;
        if (this.mesh) {
            this.mesh.position.copy(position.getPosition());
        }
    }

    // Анимация ухода куба
    async leave(activeOrbit, targetOrbit, animationManager, allCubes, enteringCube = null) {
        if (this.isLeaving) return;
        this.isLeaving = true;
        this.isActive = false;

        const startPos = this.mesh.position.clone();
        const startScale = this.mesh.scale.clone();
        
        // Фаза 1: Уменьшение и движение к орбите
        const phase1Duration = 5;
        const targetPos1 = new THREE.Vector3(
            this.currentPosition.targetX,
            0,
            this.currentPosition.radius
        );
        const targetScale1 = startScale.clone().multiplyScalar(1 / 4.6);

        await animationManager.animate(
            phase1Duration,
            (t) => {
                this.mesh.position.lerpVectors(startPos, targetPos1, t);
                this.mesh.scale.lerpVectors(startScale, targetScale1, t);
            }
        );

        // Фаза 2: Вращение орбиты
        const phase2Duration = 10;
        const orbit = this.currentPosition.orbit;
        const numOnOrbit = this.currentPosition.numOnOrbit;
        const quantity = this.currentPosition.quantity;
        
        // Определяем направление вращения
        const shouldRotate = targetOrbit !== activeOrbit;
        let rotationDirection = 0;
        
        if (shouldRotate) {
            // Переход с активной на пассивную позицию
            const passiveAngle = (2 * Math.PI) / (quantity + 1);
            const activeAngle = (2 * Math.PI) / quantity;
            const currentAngle = numOnOrbit * activeAngle;
            const targetAngle = numOnOrbit * passiveAngle;
            
            // Выбираем кратчайший путь
            let angleDiff = targetAngle - currentAngle;
            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            rotationDirection = angleDiff;
        } else if (enteringCube && enteringCube.currentPosition.orbit === orbit) {
            // Если входящий куб на той же орбите, вращаем в его сторону
            const enteringAngle = Math.atan2(
                enteringCube.mesh.position.z,
                enteringCube.mesh.position.y
            );
            const currentAngle = Math.atan2(this.mesh.position.z, this.mesh.position.y);
            let angleDiff = enteringAngle - currentAngle;
            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            // Вращаем в сторону входящего куба
            rotationDirection = angleDiff * 0.3; // Частичное вращение
        }
        
        if (rotationDirection !== 0) {
            // Вращаем все кубы на этой орбите
            const orbitCubes = allCubes.filter(c => 
                c.currentPosition && 
                c.currentPosition.orbit === orbit && 
                c !== this &&
                c !== enteringCube
            );
            
            const startAngle = Math.atan2(this.mesh.position.z, this.mesh.position.y);
            const radius = this.currentPosition.radius;
            
            // Сохраняем начальные углы всех кубов на орбите
            const orbitCubesData = orbitCubes.map(cube => {
                const angle = Math.atan2(cube.mesh.position.z, cube.mesh.position.y);
                return { cube, startAngle: angle };
            });

            await animationManager.animate(
                phase2Duration,
                (t) => {
                    // Вращаем текущий куб
                    const angle = startAngle + rotationDirection * t;
                    this.mesh.position.y = radius * Math.cos(angle);
                    this.mesh.position.z = radius * Math.sin(angle);
                    
                    // Вращаем все остальные кубы на орбите
                    orbitCubesData.forEach(({ cube, startAngle: startA }) => {
                        const newAngle = startA + rotationDirection * t;
                        cube.mesh.position.y = radius * Math.cos(newAngle);
                        cube.mesh.position.z = radius * Math.sin(newAngle);
                    });
                }
            );
        } else {
            // Просто ждем
            await new Promise(resolve => setTimeout(resolve, phase2Duration * 100));
        }

        // Обновляем позицию
        this.currentPosition.setStatus(false, targetOrbit);
        this.currentPosition.updatePosition(targetOrbit);
        this.isLeaving = false;
    }

    // Анимация входа куба
    async enter(activeOrbit, animationManager, allCubes) {
        if (this.isEntering) return;
        this.isEntering = true;
        this.isActive = true;

        const orbit = this.currentPosition.orbit;
        const radius = this.currentPosition.radius;
        const numOnOrbit = this.currentPosition.numOnOrbit;
        const quantity = this.currentPosition.quantity;

        // Фаза 2: Вращение орбит
        const phase2Duration = 10;
        const activeAngle = (2 * Math.PI) / quantity;
        const targetAngle = numOnOrbit * activeAngle;
        
        const currentAngle = Math.atan2(this.mesh.position.z, this.mesh.position.y);
        let angleDiff = targetAngle - currentAngle;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Вращаем все кубы на этой орбите
        const orbitCubes = allCubes.filter(c => 
            c.currentPosition && 
            c.currentPosition.orbit === orbit && 
            c !== this
        );

        // Сохраняем начальные углы всех кубов на орбите
        const orbitCubesData = orbitCubes.map(cube => {
            const angle = Math.atan2(cube.mesh.position.z, cube.mesh.position.y);
            const targetA = cube.currentPosition.numOnOrbit * activeAngle;
            let diff = targetA - angle;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;
            return { cube, startAngle: angle, angleDiff: diff };
        });

        await animationManager.animate(
            phase2Duration,
            (t) => {
                // Вращаем текущий куб
                const angle = currentAngle + angleDiff * t;
                this.mesh.position.y = radius * Math.cos(angle);
                this.mesh.position.z = radius * Math.sin(angle);
                
                // Вращаем все остальные кубы на орбите
                orbitCubesData.forEach(({ cube, startAngle: startA, angleDiff: diff }) => {
                    const newAngle = startA + diff * t;
                    cube.mesh.position.y = radius * Math.cos(newAngle);
                    cube.mesh.position.z = radius * Math.sin(newAngle);
                });
            }
        );

        // Фаза 3: Увеличение и движение на сцену
        const phase3Duration = 5;
        const startPos = this.mesh.position.clone();
        const startScale = this.mesh.scale.clone();
        const targetPos = new THREE.Vector3(
            this.currentPosition.targetX,
            0,
            3.3
        );
        const targetScale = startScale.clone().multiplyScalar(4.6);

        this.currentPosition.setStatus(true, activeOrbit);
        this.currentPosition.updatePosition(activeOrbit);

        await animationManager.animate(
            phase3Duration,
            (t) => {
                this.mesh.position.lerpVectors(startPos, targetPos, t);
                this.mesh.scale.lerpVectors(startScale, targetScale, t);
            }
        );

        this.isEntering = false;
    }
}

// Класс для монеты
class Coin {
    constructor(modelPath, scene) {
        this.modelPath = modelPath;
        this.scene = scene;
        this.mesh = null;
        this.model = null;
        this.isActive = false;
        this.isAnimating = false;
        this.position = new THREE.Vector3(0, 0, 3.3);
    }

    async load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(
                this.modelPath,
                (gltf) => {
                    this.model = gltf.scene;
                    this.mesh = gltf.scene.clone();
                    this.mesh.userData.coin = this;
                    this.scene.add(this.mesh);
                    this.mesh.position.copy(this.position);
                    resolve();
                },
                undefined,
                reject
            );
        });
    }

    async leave(animationManager) {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.isActive = false;

        const startPos = this.mesh.position.clone();
        const startRotation = this.mesh.rotation.y;
        const targetPos = new THREE.Vector3(0, 0, 7.9);
        const targetRotation = startRotation + Math.PI;

        await animationManager.animate(
            10,
            (t) => {
                this.mesh.position.lerpVectors(startPos, targetPos, t);
                this.mesh.rotation.y = startRotation + (targetRotation - startRotation) * t;
            }
        );

        this.isAnimating = false;
    }

    async enter(animationManager) {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.isActive = true;

        const startPos = this.mesh.position.clone();
        const startRotation = this.mesh.rotation.y;
        const targetPos = new THREE.Vector3(0, 0, 3.3);
        const targetRotation = startRotation + Math.PI;

        await animationManager.animate(
            10,
            (t) => {
                this.mesh.position.lerpVectors(startPos, targetPos, t);
                this.mesh.rotation.y = startRotation + (targetRotation - startRotation) * t;
            }
        );

        this.isAnimating = false;
    }
}

// Менеджер анимаций
class AnimationManager {
    constructor() {
        this.animations = [];
    }

    async animate(duration, updateFn) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const animate = (currentTime) => {
                const elapsed = (currentTime - startTime) / 1000; // в секундах
                const t = Math.min(elapsed / duration, 1);
                
                // Easing функция для плавности
                const easedT = this.easeInOutCubic(t);
                updateFn(easedT);
                
                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            requestAnimationFrame(animate);
        });
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
}

// Главный класс приложения
class App {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.positions = [];
        this.cubes = [];
        this.coin = null;
        this.activeCube = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.animationManager = new AnimationManager();
        this.isAnimating = false;
        
        this.init();
    }

    init() {
        // Создание сцены
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        // Камера
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        // Рендерер
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        // Контролы камеры
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Освещение
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(-5, 5, -5);
        this.scene.add(pointLight);

        // Создание позиций
        for (let i = 0; i < 14; i++) {
            this.positions.push(new Position(i + 1));
        }

        // Загрузка моделей
        this.loadModels();

        // Обработка событий
        window.addEventListener('resize', () => this.onWindowResize());
        this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => {
            this.onMouseMove(e);
            this.onMouseHover(e);
        });

        // Анимационный цикл
        this.animate();
    }

    async loadModels() {
        try {
            console.log('Начало загрузки моделей...');
            
            // Загрузка монеты
            try {
                this.coin = new Coin('models/coin.glb', this.scene);
                await this.coin.load();
                console.log('Монета загружена');
            } catch (error) {
                console.warn('Не удалось загрузить монету:', error);
                // Создаем простую геометрию вместо монеты
                const coinGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32);
                const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });
                const coinMesh = new THREE.Mesh(coinGeometry, coinMaterial);
                coinMesh.position.set(0, 0, 3.3);
                coinMesh.userData.coin = { enter: () => {}, leave: () => {} };
                this.scene.add(coinMesh);
            }

            // Загрузка кубов
            for (let i = 0; i < 14; i++) {
                try {
                    const number = String(i + 1).padStart(3, '0');
                    const cube = new Cube(
                        i + 1,
                        `models/cube.${number}.glb`,
                        this.scene
                    );
                    await cube.load();
                    this.cubes.push(cube);
                    console.log(`Куб ${number} загружен`);
                } catch (error) {
                    console.warn(`Не удалось загрузить куб ${i + 1}:`, error);
                    // Создаем простой куб вместо модели
                    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
                    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
                    const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
                    const cube = new Cube(i + 1, '', this.scene);
                    cube.mesh = cubeMesh;
                    cube.mesh.userData.cube = cube;
                    this.scene.add(cubeMesh);
                    this.cubes.push(cube);
                }
            }

            // Распределение кубов по позициям
            this.distributeCubes();
            
            console.log('Все модели загружены и распределены');
        } catch (error) {
            console.error('Критическая ошибка загрузки моделей:', error);
        }
    }

    distributeCubes() {
        // Распределяем кубы по позициям
        // Каждый куб ищет ближайшую свободную позицию
        const usedPositions = new Set();
        
        for (const cube of this.cubes) {
            let bestPosition = null;
            let minDistance = Infinity;
            
            // Ищем ближайшую свободную позицию
            for (const position of this.positions) {
                if (usedPositions.has(position)) continue;
                
                // Вычисляем расстояние от текущей позиции куба до позиции
                const cubeCurrentPos = cube.mesh ? cube.mesh.position : new THREE.Vector3(0, 0, 0);
                const posVector = position.getPosition();
                const distance = cubeCurrentPos.distanceTo(posVector);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    bestPosition = position;
                }
            }
            
            if (bestPosition) {
                cube.setPosition(bestPosition);
                usedPositions.add(bestPosition);
                
                // Устанавливаем начальный масштаб и позицию
                if (cube.mesh) {
                    cube.mesh.scale.set(0.217, 0.217, 0.217); // 1/4.6
                    cube.mesh.position.copy(bestPosition.getPosition());
                }
            }
        }
    }
    
    // Обновление позиций кубов после анимации
    updateCubePositionsAfterAnimation() {
        // Проходим по каждой позиции и ищем ближайший куб
        // Сначала освобождаем все позиции
        for (const position of this.positions) {
            position.currentCube = null;
        }
        
        // Затем для каждого куба ищем ближайшую позицию
        for (const cube of this.cubes) {
            if (!cube.mesh) continue;
            if (cube.isEntering || cube.isLeaving) continue;
            
            let nearestPosition = null;
            let minDistance = Infinity;
            
            for (const position of this.positions) {
                // Пропускаем позиции, которые уже заняты
                if (position.currentCube && position.currentCube !== cube) continue;
                
                const distance = cube.mesh.position.distanceTo(position.getPosition());
                if (distance < minDistance && distance < 2.0) {
                    minDistance = distance;
                    nearestPosition = position;
                }
            }
            
            // Если нашли ближайшую позицию, привязываем куб к ней
            if (nearestPosition) {
                cube.currentPosition = nearestPosition;
                nearestPosition.currentCube = cube;
            }
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onMouseHover(event) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        let isHovering = false;
        if (intersects.length > 0) {
            const object = intersects[0].object;
            let parent = object;
            while (parent) {
                if (parent.userData.cube || parent.userData.coin) {
                    isHovering = true;
                    break;
                }
                parent = parent.parent;
            }
        }

        this.renderer.domElement.style.cursor = isHovering ? 'pointer' : 'default';
    }

    async onMouseClick(event) {
        if (this.isAnimating) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            
            // Проверяем, кликнули ли на куб
            let clickedCube = null;
            let parent = object;
            while (parent) {
                if (parent.userData.cube) {
                    clickedCube = parent.userData.cube;
                    break;
                }
                parent = parent.parent;
            }

            // Проверяем, кликнули ли на монету
            let clickedCoin = null;
            parent = object;
            while (parent) {
                if (parent.userData.coin) {
                    clickedCoin = parent.userData.coin;
                    break;
                }
                parent = parent.parent;
            }

            if (clickedCube) {
                await this.handleCubeClick(clickedCube);
            } else if (clickedCoin) {
                await this.handleCoinClick();
            }
        }
    }

    async handleCubeClick(clickedCube) {
        if (this.isAnimating) return;
        this.isAnimating = true;

        const targetOrbit = clickedCube.currentPosition.orbit;
        const currentActiveOrbit = this.activeCube 
            ? this.activeCube.currentPosition.orbit 
            : -1;

        // Если кликнули на активный куб, ничего не делаем
        if (this.activeCube === clickedCube) {
            this.isAnimating = false;
            return;
        }

        // Обновляем статусы позиций перед анимацией
        this.updatePositionStatuses(targetOrbit);
        
        // Обновляем позиции всех кубов на орбитах
        for (const cube of this.cubes) {
            if (cube.currentPosition) {
                cube.currentPosition.updatePosition(targetOrbit);
            }
        }

        // Убираем активный куб (если есть)
        if (this.activeCube) {
            await this.activeCube.leave(currentActiveOrbit, targetOrbit, this.animationManager, this.cubes, clickedCube);
        }

        // Анимация входа нового куба
        await clickedCube.enter(targetOrbit, this.animationManager, this.cubes);
        
        // Обновляем привязку кубов к позициям после анимации
        this.updateCubePositionsAfterAnimation();

        // Обновляем активный куб
        this.activeCube = clickedCube;
        this.updateInfo();

        this.isAnimating = false;
    }

    async handleCoinClick() {
        if (this.isAnimating) return;
        this.isAnimating = true;

        // Убираем активный куб (если есть)
        if (this.activeCube) {
            const currentActiveOrbit = this.activeCube.currentPosition.orbit;
            await this.activeCube.leave(currentActiveOrbit, -1, this.animationManager);
            this.activeCube = null;
        }

        // Анимация монеты
        if (this.coin.isActive) {
            await this.coin.leave(this.animationManager);
        } else {
            await this.coin.enter(this.animationManager);
        }

        this.updateInfo();
        this.isAnimating = false;
    }

    updatePositionStatuses(activeOrbit) {
        for (const position of this.positions) {
            position.setStatus(position.orbit === activeOrbit, activeOrbit);
        }
    }

    updateInfo() {
        const infoElement = document.getElementById('active-cube-info');
        if (this.activeCube) {
            infoElement.textContent = `Активный куб: ${this.activeCube.number}`;
        } else {
            infoElement.textContent = 'Активный куб: нет';
        }
    }

    // Обновление позиций кубов на основе их текущих позиций
    updateCubePositions() {
        // Обновляем привязку кубов к позициям
        this.updateCubePositionsAfterAnimation();
        
        for (const cube of this.cubes) {
            if (!cube.mesh || !cube.currentPosition) continue;
            if (cube.isEntering || cube.isLeaving) continue;

            const targetPos = cube.currentPosition.getPosition();
            const currentPos = cube.mesh.position;
            
            // Проверяем, нужно ли обновить позицию
            const distance = currentPos.distanceTo(targetPos);
            if (distance > 0.01) {
                // Плавное движение к целевой позиции
                currentPos.lerp(targetPos, 0.1);
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.updateCubePositions();
        this.renderer.render(this.scene, this.camera);
    }
}

// Запуск приложения
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
